-- FAST workflows smoke tests (administrateur, sans données fictives persistées).
SELECT fast_workflows.client_cycle();
SELECT fast_workflows.driver_cycle();
SELECT workflow,status,result FROM public.fast_business_workflow_runs ORDER BY executed_at DESC LIMIT 5;
SELECT work_key,workflow,priority,status,reason_codes FROM public.fast_business_work_items ORDER BY first_seen_at DESC LIMIT 15;
SELECT d.status::text,d.is_verified,cardinality(public.fast_driver_missing_required_documents(d.user_id)) missing_count FROM public.drivers d;
SELECT has_function_privilege('anon','fast_workflows.client_cycle()','EXECUTE') anon_client,
 has_function_privilege('authenticated','fast_workflows.driver_cycle()','EXECUTE') normal_user_driver;
SELECT j.jobname,j.active,x.status FROM cron.job j LEFT JOIN LATERAL
 (SELECT status FROM cron.job_run_details d WHERE d.jobid=j.jobid ORDER BY start_time DESC LIMIT 1) x ON true
 WHERE j.jobname IN ('fast_client_onboarding_2min','fast_driver_compliance_2min');
-- Boundary assertions executed in temporary subtransactions: must not persist mock rides.
DO $t$ BEGIN
 BEGIN
  INSERT INTO public.rides(id,client_id,status,pickup_address,destination_address)
  VALUES(gen_random_uuid(),gen_random_uuid(),'requested','A test','B test');
  RAISE EXCEPTION 'FAIL_UNVERIFIED_CLIENT_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
 END;
END $t$;
DO $t$ BEGIN
 BEGIN
  INSERT INTO public.dispatch_offers(id,ride_id,driver_id,status)
  VALUES(gen_random_uuid(),gen_random_uuid(),(SELECT user_id FROM public.drivers LIMIT 1),'accepted');
  RAISE EXCEPTION 'FAIL_NONCOMPLIANT_DRIVER_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
 END;
END $t$;
