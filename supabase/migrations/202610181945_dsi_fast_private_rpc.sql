-- DSI FAST: move privileged bodies outside PostgREST public while retaining public RPC calls.
-- Already applied and authorization-tested in production on 2026-10-18.
CREATE SCHEMA IF NOT EXISTS dsi_privileged;
REVOKE ALL ON SCHEMA dsi_privileged FROM PUBLIC;
GRANT USAGE ON SCHEMA dsi_privileged TO authenticated,service_role;
DO $migrate$ BEGIN
 IF to_regprocedure('dsi_privileged.get_ride_security_state(uuid)') IS NULL THEN
   ALTER FUNCTION public.get_ride_security_state(uuid) SET SCHEMA dsi_privileged;
 END IF;
 IF to_regprocedure('dsi_privileged.issue_ride_pin(uuid)') IS NULL THEN
   ALTER FUNCTION public.issue_ride_pin(uuid) SET SCHEMA dsi_privileged;
 END IF;
 IF to_regprocedure('dsi_privileged.verify_ride_pin(uuid,text)') IS NULL THEN
   ALTER FUNCTION public.verify_ride_pin(uuid,text) SET SCHEMA dsi_privileged;
 END IF;
 IF to_regprocedure('dsi_privileged.is_fast_admin()') IS NULL THEN
   ALTER FUNCTION public.is_fast_admin() SET SCHEMA dsi_privileged;
 END IF;
END $migrate$;
REVOKE ALL ON FUNCTION dsi_privileged.get_ride_security_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dsi_privileged.get_ride_security_state(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION dsi_privileged.issue_ride_pin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dsi_privileged.issue_ride_pin(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION dsi_privileged.verify_ride_pin(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dsi_privileged.verify_ride_pin(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION dsi_privileged.is_fast_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION dsi_privileged.is_fast_admin() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_ride_security_state(p_ride_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ SELECT dsi_privileged.get_ride_security_state(p_ride_id); $function$

CREATE OR REPLACE FUNCTION public.issue_ride_pin(p_ride_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ SELECT dsi_privileged.issue_ride_pin(p_ride_id); $function$

CREATE OR REPLACE FUNCTION public.verify_ride_pin(p_ride_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ SELECT dsi_privileged.verify_ride_pin(p_ride_id,p_pin); $function$

CREATE OR REPLACE FUNCTION public.is_fast_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$ SELECT dsi_privileged.is_fast_admin(); $function$

REVOKE ALL ON FUNCTION public.get_ride_security_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ride_security_state(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_ride_pin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_ride_pin(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.verify_ride_pin(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verify_ride_pin(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.is_fast_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_fast_admin() TO authenticated,service_role;
