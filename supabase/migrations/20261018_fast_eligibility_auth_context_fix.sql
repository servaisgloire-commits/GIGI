-- Ensure SECURITY DEFINER checks actual JWT role rather than its owner.
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


