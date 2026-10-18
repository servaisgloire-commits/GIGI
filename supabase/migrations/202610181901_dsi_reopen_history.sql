-- Preserve Groq analysis history when an incident reopens. Applied on 2026-10-18.
ALTER TABLE dsi_ops.agent_tasks ADD COLUMN IF NOT EXISTS run_number integer NOT NULL DEFAULT 0;
ALTER TABLE dsi_ops.agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_incident_id_stage_key;
DO $constraints$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='dsi_ops.agent_tasks'::regclass AND conname='agent_tasks_incident_stage_run_unique') THEN
   ALTER TABLE dsi_ops.agent_tasks ADD CONSTRAINT agent_tasks_incident_stage_run_unique UNIQUE (incident_id,stage,run_number);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='dsi_ops.agent_tasks'::regclass AND conname='agent_tasks_run_number_nonnegative') THEN
   ALTER TABLE dsi_ops.agent_tasks ADD CONSTRAINT agent_tasks_run_number_nonnegative CHECK (run_number >= 0);
 END IF;
END $constraints$;
CREATE OR REPLACE FUNCTION public.dsi_agent_claim(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'dsi_ops', 'public', 'vault'
AS $function$
DECLARE authentic boolean; item record; previous_analysis text; previous_security text;
BEGIN
 authentic := (p_token IS NOT NULL AND length(p_token)=64
  AND p_token=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='dsi_dispatch_token_v1' LIMIT 1));
 IF NOT authentic THEN RETURN jsonb_build_object('ok',false,'error','UNAUTHORIZED'); END IF;
 INSERT INTO dsi_ops.agent_tasks(incident_id,organization,stage,assigned_agent,run_number)
 SELECT i.id,i.organization,st.stage,st.who,i.reopens
 FROM dsi_ops.incidents i CROSS JOIN LATERAL (
  VALUES ('diagnosis',i.owner_agent),('security_review',i.security_tester),('functional_test_plan',i.functional_tester)
 ) AS st(stage,who)
 WHERE i.state='open' AND EXISTS(SELECT 1 FROM dsi_ops.settings s WHERE s.organization=i.organization AND s.monitor_enabled)
 ON CONFLICT(incident_id,stage,run_number) DO NOTHING;
 SELECT t.id,t.incident_id,t.organization,t.stage,t.assigned_agent,t.run_number,
        i.category,i.title,i.description,i.severity INTO item
 FROM dsi_ops.agent_tasks t JOIN dsi_ops.incidents i ON i.id=t.incident_id
 WHERE t.status='queued' AND i.state='open' AND t.run_number=i.reopens
 AND (
  t.stage='diagnosis'
  OR (t.stage='security_review' AND EXISTS (
   SELECT 1 FROM dsi_ops.agent_tasks prev
   WHERE prev.incident_id=t.incident_id AND prev.run_number=t.run_number
     AND prev.stage='diagnosis' AND prev.status='completed'))
  OR (t.stage='functional_test_plan' AND EXISTS (
   SELECT 1 FROM dsi_ops.agent_tasks prev
   WHERE prev.incident_id=t.incident_id AND prev.run_number=t.run_number
     AND prev.stage='security_review' AND prev.status='completed'))
 )
 ORDER BY t.created_at,t.id LIMIT 1 FOR UPDATE OF t SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'task',null); END IF;
 UPDATE dsi_ops.agent_tasks SET status='working',started_at=now(),attempts=attempts+1 WHERE id=item.id;
 SELECT left(output,1800) INTO previous_analysis FROM dsi_ops.agent_tasks
 WHERE incident_id=item.incident_id AND run_number=item.run_number AND stage='diagnosis' AND status='completed' LIMIT 1;
 SELECT left(output,1800) INTO previous_security FROM dsi_ops.agent_tasks
 WHERE incident_id=item.incident_id AND run_number=item.run_number AND stage='security_review' AND status='completed' LIMIT 1;
 RETURN jsonb_build_object('ok',true,'task',jsonb_build_object(
   'id',item.id,'incident_id',item.incident_id,'organization',item.organization,
   'run_number',item.run_number,'stage',item.stage,'agent',item.assigned_agent,
   'category',item.category,'title',left(item.title,200),
   'description',left(coalesce(item.description,''),1500),'severity',item.severity,
   'previous_diagnosis',coalesce(previous_analysis,''),'previous_security_review',coalesce(previous_security,'')));
END $function$

REVOKE ALL ON FUNCTION public.dsi_agent_claim(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dsi_agent_claim(text) TO service_role;
