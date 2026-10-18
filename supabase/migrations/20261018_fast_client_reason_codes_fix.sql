-- Fix applied after initial FAST workflows migration.
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
  (SELECT coalesce(jsonb_agg(elem),'[]'::jsonb)
   FROM jsonb_array_elements(jsonb_build_array(
     CASE WHEN u.email_confirmed_at IS NULL THEN 'EMAIL_UNCONFIRMED' END,
     CASE WHEN nullif(trim(coalesce(p.first_name,'')),'') IS NULL THEN 'FIRST_NAME_MISSING' END,
     CASE WHEN nullif(trim(coalesce(p.last_name,'')),'') IS NULL THEN 'LAST_NAME_MISSING' END,
     CASE WHEN nullif(trim(coalesce(p.phone,'')),'') IS NULL THEN 'CONTACT_PHONE_MISSING' END
   )) AS elem WHERE elem<>'null'::jsonb),
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
