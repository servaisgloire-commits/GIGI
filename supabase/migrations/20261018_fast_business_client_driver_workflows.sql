-- FAST N°1: safe automated client onboarding and driver/compliance workflows.
-- Customer preflight automates account readiness; driver identity/licence authenticity stays human-reviewed.
CREATE SCHEMA IF NOT EXISTS fast_workflows;
REVOKE ALL ON SCHEMA fast_workflows FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.fast_business_work_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 work_key text NOT NULL UNIQUE,
 subject_id uuid NOT NULL,
 workflow text NOT NULL CHECK(workflow IN('client','driver','document')),
 owner_department text NOT NULL,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('normal','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
 human_review_required boolean NOT NULL DEFAULT true,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS fast_work_items_open_idx ON public.fast_business_work_items(status,workflow,priority);
ALTER TABLE public.fast_business_work_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fast_business_work_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fast_business_work_items TO authenticated;
CREATE POLICY "fast_business_admin_read" ON public.fast_business_work_items
 FOR SELECT TO authenticated USING (public.is_fast_admin());

CREATE TABLE IF NOT EXISTS public.fast_business_workflow_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow text NOT NULL CHECK(workflow IN('client','driver')),
 status text NOT NULL CHECK(status IN('completed','failed')),
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 executed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fast_business_workflow_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fast_business_workflow_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fast_business_workflow_runs TO authenticated;
CREATE POLICY "fast_business_runs_admin_read" ON public.fast_business_workflow_runs
 FOR SELECT TO authenticated USING(public.is_fast_admin());

CREATE OR REPLACE FUNCTION fast_workflows.work_item(p_key text,p_subject uuid,p_flow text,
 p_department text,p_priority text,p_codes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $f$
BEGIN
 INSERT INTO public.fast_business_work_items(work_key,subject_id,workflow,owner_department,priority,reason_codes)
 VALUES(p_key,p_subject,p_flow,p_department,p_priority,coalesce(p_codes,'[]'::jsonb))
 ON CONFLICT(work_key) DO UPDATE SET status='open',
   priority=EXCLUDED.priority,reason_codes=EXCLUDED.reason_codes,
   last_seen_at=now(),resolved_at=NULL;
END $f$;

CREATE OR REPLACE FUNCTION fast_workflows.client_cycle()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,fast_workflows AS $f$
DECLARE v_created int=0;v_validated int=0;v_pending int=0;v_run uuid=gen_random_uuid();
BEGIN
 IF NOT pg_try_advisory_xact_lock(10510,1) THEN
   RETURN jsonb_build_object('ok',true,'skipped','already_running');
 END IF;
 -- Missing controls are created pending, without reactivating invalidated accounts.
 INSERT INTO public.account_admin_controls(user_id,account_role,admin_status,is_active)
 SELECT p.id,'client','pending',true FROM public.profiles p
 WHERE p.role='client' AND NOT EXISTS
 (SELECT 1 FROM public.account_admin_controls c WHERE c.user_id=p.id)
 ON CONFLICT(user_id) DO NOTHING;
 GET DIAGNOSTICS v_created=ROW_COUNT;

 -- Technical validation is NOT official identity verification.
 WITH eligible AS (
  SELECT c.user_id FROM public.account_admin_controls c
   JOIN public.profiles p ON p.id=c.user_id AND p.role='client'
   JOIN auth.users u ON u.id=c.user_id
  WHERE c.account_role='client' AND c.admin_status='pending'
   AND c.is_active=true AND u.email_confirmed_at IS NOT NULL
   AND nullif(trim(coalesce(p.first_name,'')),'') IS NOT NULL
   AND nullif(trim(coalesce(p.last_name,'')),'') IS NOT NULL
   AND nullif(trim(coalesce(p.phone,'')),'') IS NOT NULL
 )
 UPDATE public.account_admin_controls c
   SET admin_status='validated',validated_at=now(),internal_reason='automatic_verified_email_and_complete_profile',
       updated_at=now()
 FROM eligible e WHERE c.user_id=e.user_id;
 GET DIAGNOSTICS v_validated=ROW_COUNT;

 -- Any still-pending client is a service queue item, not an auto-rejected account.
 INSERT INTO public.fast_business_work_items
  (work_key,subject_id,workflow,owner_department,priority,reason_codes,human_review_required)
 SELECT 'client:preflight:'||c.user_id,c.user_id,'client','client_accounts','normal',
  jsonb_build_array(
   CASE WHEN u.email_confirmed_at IS NULL THEN 'EMAIL_UNCONFIRMED' END,
   CASE WHEN nullif(trim(coalesce(p.first_name,'')),'') IS NULL THEN 'FIRST_NAME_MISSING' END,
   CASE WHEN nullif(trim(coalesce(p.last_name,'')),'') IS NULL THEN 'LAST_NAME_MISSING' END,
   CASE WHEN nullif(trim(coalesce(p.phone,'')),'') IS NULL THEN 'CONTACT_PHONE_MISSING' END
  )- 'null'::jsonb,
  true
 FROM public.account_admin_controls c
 JOIN public.profiles p ON p.id=c.user_id
 JOIN auth.users u ON u.id=c.user_id
 WHERE c.account_role='client' AND c.admin_status='pending' AND c.is_active=true
 ON CONFLICT(work_key) DO UPDATE SET status='open',reason_codes=EXCLUDED.reason_codes,
  last_seen_at=now(),resolved_at=NULL;

 UPDATE public.fast_business_work_items w
 SET status='resolved',resolved_at=now(),last_seen_at=now()
 FROM public.account_admin_controls c
 WHERE w.work_key='client:preflight:'||c.user_id AND w.status='open'
 AND (c.admin_status IN ('validated','invalidated') OR c.is_active=false);
 SELECT count(*) INTO v_pending FROM public.fast_business_work_items
 WHERE workflow='client' AND status='open';
 INSERT INTO public.fast_business_workflow_runs(id,workflow,status,result)
 VALUES(v_run,'client','completed',jsonb_build_object('created_controls',v_created,
 'auto_validated_clients',v_validated,'pending_review',v_pending));
 RETURN jsonb_build_object('ok',true,'auto_validated_clients',v_validated,'pending_review',v_pending,
  'scope','profile_preflight_only');
END $f$;

-- A driver cannot be approved or marked online merely by uploading metadata.
CREATE OR REPLACE FUNCTION fast_workflows.guard_driver_online()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,fast_workflows AS $f$
BEGIN
 IF NEW.status='available'::public.driver_status
 AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
   IF NEW.is_verified IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'FAST_DRIVER_NOT_VERIFIED' USING ERRCODE='23514';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.account_admin_controls c
      WHERE c.user_id=NEW.user_id AND c.account_role='driver'
      AND c.admin_status='validated' AND c.is_active=true) THEN
      RAISE EXCEPTION 'FAST_DRIVER_ADMIN_APPROVAL_REQUIRED' USING ERRCODE='23514';
   END IF;
   IF cardinality(public.fast_driver_missing_required_documents(NEW.user_id))>0 THEN
     RAISE EXCEPTION 'FAST_DRIVER_DOCUMENTS_INCOMPLETE' USING ERRCODE='23514';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.vehicles v WHERE v.driver_id=NEW.user_id AND v.is_active=true
    AND NULLIF(trim(coalesce(v.photo_path,'')),'') IS NOT NULL) THEN
     RAISE EXCEPTION 'FAST_DRIVER_VALID_VEHICLE_PHOTO_REQUIRED' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_fast_workflow_driver_online_guard ON public.drivers;
CREATE TRIGGER trg_fast_workflow_driver_online_guard
 BEFORE INSERT OR UPDATE OF status ON public.drivers
 FOR EACH ROW EXECUTE FUNCTION fast_workflows.guard_driver_online();

-- Authenticated drivers may upload/update their own pending files;
-- only a trusted admin/server can approve/reject or write reviewer identity.
CREATE OR REPLACE FUNCTION fast_workflows.guard_document_review()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,fast_workflows AS $f$
BEGIN
 IF current_user='authenticated' THEN
  IF NEW.driver_id IS DISTINCT FROM auth.uid()
   OR NEW.status IS DISTINCT FROM 'pending'
   OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
   OR (TG_OP='UPDATE' AND (OLD.status IS DISTINCT FROM 'pending'
      OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
      OR NEW.status IS DISTINCT FROM OLD.status))
  THEN
    RAISE EXCEPTION 'FAST_DOCUMENT_ADMIN_REVIEW_REQUIRED' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_fast_document_no_self_approval ON public.driver_documents;
CREATE TRIGGER trg_fast_document_no_self_approval
 BEFORE INSERT OR UPDATE ON public.driver_documents
 FOR EACH ROW EXECUTE FUNCTION fast_workflows.guard_document_review();

-- Re-use existing security/notification trigger functions that existed but were not wired.
DROP TRIGGER IF EXISTS trg_fast_driver_verify_documents ON public.drivers;
CREATE TRIGGER trg_fast_driver_verify_documents BEFORE UPDATE OF is_verified
 ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.fast_guard_driver_verification();
DROP TRIGGER IF EXISTS trg_fast_driver_availability_documents ON public.drivers;
CREATE TRIGGER trg_fast_driver_availability_documents BEFORE UPDATE OF status
 ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.fast_guard_driver_availability_compliance();
DROP TRIGGER IF EXISTS trg_fast_driver_notification ON public.drivers;
CREATE TRIGGER trg_fast_driver_notification AFTER UPDATE OF is_verified
 ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.fast_notify_driver_verification();
DROP TRIGGER IF EXISTS trg_fast_doc_unverify ON public.driver_documents;
CREATE TRIGGER trg_fast_doc_unverify AFTER INSERT OR UPDATE OF status,expires_at
 ON public.driver_documents FOR EACH ROW EXECUTE FUNCTION public.fast_unverify_driver_on_document_change();
DROP TRIGGER IF EXISTS trg_fast_doc_notification ON public.driver_documents;
CREATE TRIGGER trg_fast_doc_notification AFTER UPDATE OF status
 ON public.driver_documents FOR EACH ROW EXECUTE FUNCTION public.fast_notify_document_review();

CREATE OR REPLACE FUNCTION fast_workflows.driver_cycle()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,fast_workflows AS $f$
DECLARE v_driver record;v_doc record;v_missing text[];v_codes jsonb;
 v_revoked int=0;v_pending int=0;v_run uuid=gen_random_uuid();
 v_has_vehicle boolean;v_admin_ready boolean;
BEGIN
 IF NOT pg_try_advisory_xact_lock(10510,2) THEN
  RETURN jsonb_build_object('ok',true,'skipped','already_running');
 END IF;
 -- Every driver gets a pending admin review entry if no record yet.
 INSERT INTO public.account_admin_controls(user_id,account_role,admin_status,is_active)
 SELECT p.id,'driver','pending',true FROM public.profiles p WHERE p.role='driver'
 AND NOT EXISTS (SELECT 1 FROM public.account_admin_controls c WHERE c.user_id=p.id)
 ON CONFLICT(user_id) DO NOTHING;

 FOR v_driver IN
  SELECT d.user_id,d.status,d.is_verified,c.admin_status,c.is_active,
   p.role::text role FROM public.drivers d
   JOIN public.profiles p ON p.id=d.user_id
   LEFT JOIN public.account_admin_controls c ON c.user_id=d.user_id
 LOOP
  v_missing := public.fast_driver_missing_required_documents(v_driver.user_id);
  SELECT EXISTS(SELECT 1 FROM public.vehicles v WHERE v.driver_id=v_driver.user_id
    AND v.is_active=true AND nullif(trim(coalesce(v.photo_path,'')),'') IS NOT NULL) INTO v_has_vehicle;
  v_admin_ready := (v_driver.admin_status='validated' AND v_driver.is_active IS TRUE);
  v_codes := COALESCE(to_jsonb(v_missing),'[]'::jsonb);
  IF NOT v_has_vehicle THEN v_codes := v_codes||'["ACTIVE_VEHICLE_WITH_PHOTO_REQUIRED"]'::jsonb; END IF;
  IF NOT v_admin_ready THEN v_codes := v_codes||'["DRIVER_ADMIN_APPROVAL_REQUIRED"]'::jsonb; END IF;
  IF cardinality(v_missing)>0 OR NOT v_admin_ready OR NOT v_has_vehicle THEN
    PERFORM fast_workflows.work_item('driver:readiness:'||v_driver.user_id,v_driver.user_id,
      'driver','driver_compliance',CASE WHEN v_driver.status='available' THEN 'critical' ELSE 'high' END,v_codes);
    -- Fail closed for noncompliant drivers: do not disrupt an in-progress ride marked busy.
    IF v_driver.is_verified OR v_driver.status='available' THEN
     UPDATE public.drivers d SET is_verified=false,
       status=CASE WHEN d.status='available' THEN 'offline'::public.driver_status ELSE d.status END,
       updated_at=now()
     WHERE user_id=v_driver.user_id AND (is_verified OR status='available');
     GET DIAGNOSTICS v_pending=ROW_COUNT;v_revoked:=v_revoked+v_pending;
    END IF;
  ELSE
    UPDATE public.fast_business_work_items SET status='resolved',resolved_at=now(),last_seen_at=now()
     WHERE work_key='driver:readiness:'||v_driver.user_id AND status='open';
    -- Never auto-set drivers.is_verified, never auto-grant driver admin validation.
    IF v_driver.is_verified IS DISTINCT FROM true THEN
      PERFORM fast_workflows.work_item('driver:approval:'||v_driver.user_id,v_driver.user_id,
         'driver','driver_compliance','normal','["MANUAL_FINAL_DRIVER_APPROVAL_REQUIRED"]'::jsonb);
    ELSE
      UPDATE public.fast_business_work_items SET status='resolved',resolved_at=now(),last_seen_at=now()
       WHERE work_key='driver:approval:'||v_driver.user_id AND status='open';
    END IF;
  END IF;
 END LOOP;
 FOR v_doc IN SELECT id,driver_id,status,document_type,expires_at,storage_path,file_name,mime_type,file_size_bytes
  FROM public.driver_documents
 LOOP
   v_codes:='[]'::jsonb;
   IF v_doc.status='pending' THEN v_codes:=v_codes||'["DOCUMENT_HUMAN_REVIEW_REQUIRED"]'::jsonb; END IF;
   IF v_doc.expires_at IS NOT NULL AND v_doc.expires_at<CURRENT_DATE THEN
      v_codes:=v_codes||'["DOCUMENT_EXPIRED"]'::jsonb; END IF;
   IF NULLIF(trim(COALESCE(v_doc.storage_path,'')),'') IS NULL
      OR NULLIF(trim(COALESCE(v_doc.file_name,'')),'') IS NULL THEN
      v_codes:=v_codes||'["FILE_REFERENCE_MISSING"]'::jsonb;END IF;
   IF COALESCE(v_doc.file_size_bytes,0)<=0 THEN
      v_codes:=v_codes||'["FILE_METADATA_MISSING"]'::jsonb;END IF;
   IF v_doc.status='rejected' THEN v_codes:=v_codes||'["DOCUMENT_REJECTED_NEEDS_REUPLOAD"]'::jsonb;END IF;
   IF jsonb_array_length(v_codes)>0 THEN
    PERFORM fast_workflows.work_item('document:check:'||v_doc.id,v_doc.driver_id,
      'document','document_review',CASE WHEN v_doc.status='rejected' THEN 'high' ELSE 'normal' END,v_codes);
   ELSE
    UPDATE public.fast_business_work_items SET status='resolved',resolved_at=now(),last_seen_at=now()
     WHERE work_key='document:check:'||v_doc.id AND status='open';
   END IF;
 END LOOP;
 SELECT count(*) INTO v_pending FROM public.fast_business_work_items w
 WHERE w.workflow IN('driver','document') AND w.status='open';
 INSERT INTO public.fast_business_workflow_runs(id,workflow,status,result)
 VALUES(v_run,'driver','completed',jsonb_build_object('drivers_blocked_from_availability',v_revoked,
  'open_work_items',v_pending,'automatically_approved_documents',0));
 RETURN jsonb_build_object('ok',true,'drivers_blocked_from_availability',v_revoked,
 'open_work_items',v_pending,'manual_document_review_required',true);
END $f$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fast_workflows FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('fast_client_onboarding_2min','*/2 * * * *','SELECT fast_workflows.client_cycle();');
SELECT cron.schedule('fast_driver_compliance_2min','1-59/2 * * * *','SELECT fast_workflows.driver_cycle();');
