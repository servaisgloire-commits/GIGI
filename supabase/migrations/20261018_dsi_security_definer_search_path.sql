-- DSI FAST: privileged RPC search_path hardening.
-- Applied in production 2026-10-18. Idempotent schema configuration.
-- authenticated EXECUTE grants are deliberately maintained: the mobile app
-- requires these RPCs and their bodies check auth.uid() and ride participants.
ALTER FUNCTION public.get_ride_security_state(uuid) SET search_path = pg_catalog;
ALTER FUNCTION public.issue_ride_pin(uuid) SET search_path = pg_catalog;
ALTER FUNCTION public.verify_ride_pin(uuid, text) SET search_path = pg_catalog;
-- public.is_fast_admin() already uses an empty search_path.
