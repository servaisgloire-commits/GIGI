-- DSI realtime event bridge. Already applied to FAST Supabase on 2026-10-18.
-- Uses a named Vault secret at runtime; no key values or business data are stored here.
CREATE OR REPLACE FUNCTION dsi_ops.push_realtime_groq()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'dsi_ops', 'vault', 'net'
AS $function$
DECLARE
 v_incident bigint; v_token text; v_request bigint; v_org text;
BEGIN
 IF TG_TABLE_NAME='incidents' THEN
   IF NEW.state <> 'open' OR (TG_OP='UPDATE' AND OLD.state='open') THEN RETURN NEW; END IF;
   v_incident:=NEW.id;
   v_org:=NEW.organization;
 ELSIF TG_TABLE_NAME='agent_tasks' THEN
   IF TG_OP <> 'UPDATE' OR NEW.status <> 'completed' OR OLD.status='completed' THEN RETURN NEW; END IF;
   v_incident:=NEW.incident_id;
   v_org:=NEW.organization;
 ELSE
   RETURN NEW;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM dsi_ops.settings s WHERE s.organization=v_org AND s.monitor_enabled) THEN
   RETURN NEW;
 END IF;
 SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='dsi_dispatch_token_v1' LIMIT 1;
 IF length(coalesce(v_token,'')) <> 64 THEN
   INSERT INTO dsi_ops.audit_events(event_type,subject,details)
   VALUES('realtime_bridge_unconfigured',v_incident::text,jsonb_build_object('source',TG_TABLE_NAME));
   RETURN NEW;
 END IF;
 SELECT net.http_post(
   url:='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/dsi-agent-engine',
   body:=jsonb_build_object('trigger','dsi-realtime','incident_id',v_incident),
   headers:=jsonb_build_object('Content-Type','application/json','x-dsi-token',v_token),
   timeout_milliseconds:=25000
 ) INTO v_request;
 INSERT INTO dsi_ops.audit_events(event_type,subject,details)
 VALUES('realtime_bridge_dispatched',v_incident::text,
  jsonb_build_object('request_id',v_request,'trigger',TG_TABLE_NAME,'operation',TG_OP));
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'DSI realtime Groq trigger could not dispatch: %',SQLSTATE;
 RETURN NEW;
END $function$

REVOKE ALL ON FUNCTION dsi_ops.push_realtime_groq() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS dsi_instant_incident_trigger ON dsi_ops.incidents;
CREATE TRIGGER dsi_instant_incident_trigger AFTER INSERT OR UPDATE OF state ON dsi_ops.incidents FOR EACH ROW EXECUTE FUNCTION dsi_ops.push_realtime_groq();
DROP TRIGGER IF EXISTS dsi_instant_stage_trigger ON dsi_ops.agent_tasks;
CREATE TRIGGER dsi_instant_stage_trigger AFTER UPDATE OF status ON dsi_ops.agent_tasks FOR EACH ROW EXECUTE FUNCTION dsi_ops.push_realtime_groq();
