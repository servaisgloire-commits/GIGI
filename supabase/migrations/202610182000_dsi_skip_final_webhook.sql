-- Skip redundant fourth HTTP call after the final DSI QA planning stage.
-- Tested in live Supabase with an isolated synthetic incident; three Groq stages completed.
-- Already applied 2026-10-18, no data mutation or secrets written to source.
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
   -- The final functional_test_plan stage has no following task.
   -- Skip an unnecessary fourth Groq HTTP request per incident cycle.
   IF TG_OP <> 'UPDATE' OR NEW.status <> 'completed' OR OLD.status='completed'
      OR NEW.stage='functional_test_plan' THEN RETURN NEW; END IF;
   -- The QA plan is the final stage: no further Groq task needs dispatch.
   IF NEW.stage='functional_test_plan' THEN RETURN NEW; END IF;
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
;
