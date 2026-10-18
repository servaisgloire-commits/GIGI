-- Enforce account and driver eligibility at the transaction boundary.
-- Even if a web or mobile caller skips the GUI, invalid accounts cannot create/accept rides.
CREATE OR REPLACE FUNCTION fast_workflows.guard_client_new_ride()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth AS $fn$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')='authenticated' AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.client_id) THEN
    RAISE EXCEPTION 'FAST_CLIENT_OWNERSHIP_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NEW.client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
      JOIN public.account_admin_controls c ON c.user_id=p.id
      JOIN auth.users u ON u.id=p.id
    WHERE p.id=NEW.client_id AND p.role='client'::public.fast_user_role
      AND c.account_role='client' AND c.admin_status='validated'
      AND c.is_active=true AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAST_CLIENT_ACCOUNT_NOT_VALIDATED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_fast_client_validated_before_ride ON public.rides;
CREATE TRIGGER trg_fast_client_validated_before_ride
 BEFORE INSERT ON public.rides FOR EACH ROW
 EXECUTE FUNCTION fast_workflows.guard_client_new_ride();

CREATE OR REPLACE FUNCTION fast_workflows.guard_driver_ride_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth AS $fn$
BEGIN
 IF NEW.status='accepted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
   IF coalesce(current_setting('request.jwt.claim.role',true),'')='authenticated' AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.driver_id) THEN
     RAISE EXCEPTION 'FAST_DRIVER_OWNERSHIP_REQUIRED' USING ERRCODE='23514';
   END IF;
   IF NEW.driver_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.drivers d
    JOIN public.account_admin_controls c ON c.user_id=d.user_id
    WHERE d.user_id=NEW.driver_id AND d.is_verified=true
      AND c.admin_status='validated' AND c.account_role='driver' AND c.is_active=true
   ) OR cardinality(public.fast_driver_missing_required_documents(NEW.driver_id))>0 THEN
     RAISE EXCEPTION 'FAST_DRIVER_NOT_COMPLIANT_FOR_RIDE' USING ERRCODE='23514';
   END IF;
   IF NOT EXISTS(
     SELECT 1 FROM public.vehicles v
     WHERE v.driver_id=NEW.driver_id AND v.is_active=true
       AND (NEW.vehicle_id IS NULL OR v.id=NEW.vehicle_id)
       AND NULLIF(trim(coalesce(v.photo_path,'')),'') IS NOT NULL
   ) THEN
     RAISE EXCEPTION 'FAST_VEHICLE_NOT_VALIDATED_FOR_RIDE' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_fast_driver_eligible_offer_accept ON public.dispatch_offers;
CREATE TRIGGER trg_fast_driver_eligible_offer_accept
 BEFORE INSERT OR UPDATE OF status ON public.dispatch_offers
 FOR EACH ROW EXECUTE FUNCTION fast_workflows.guard_driver_ride_acceptance();

CREATE OR REPLACE FUNCTION fast_workflows.notify_verified_client()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NEW.account_role='client' AND NEW.is_active=true AND
    NEW.admin_status='validated' AND OLD.admin_status IS DISTINCT FROM NEW.admin_status THEN
   INSERT INTO public.notifications(user_id,title,body,data)
   VALUES(NEW.user_id,'Compte client FAST prêt',
    'Votre compte client a passé les vérifications techniques et peut accéder aux réservations.',
    '{"type":"client_onboarding","check":"verified_email_and_profile"}'::jsonb);
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_fast_auto_client_validation_notification ON public.account_admin_controls;
CREATE TRIGGER trg_fast_auto_client_validation_notification
 AFTER UPDATE OF admin_status ON public.account_admin_controls
 FOR EACH ROW EXECUTE FUNCTION fast_workflows.notify_verified_client();

REVOKE ALL ON FUNCTION fast_workflows.guard_client_new_ride() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION fast_workflows.guard_driver_ride_acceptance() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION fast_workflows.notify_verified_client() FROM PUBLIC,anon,authenticated;
