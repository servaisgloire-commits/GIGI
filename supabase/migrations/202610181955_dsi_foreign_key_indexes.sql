-- DSI FAST: covering foreign-key indexes for small agent collaboration tables.
-- Already applied on 2026-10-18 (all source tables <=224kB).
SET LOCAL lock_timeout = '3s';
CREATE INDEX IF NOT EXISTS dsi_cov_fk_01_20261018 ON public.fast_discussion_agent_requests(agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_02_20261018 ON public.fast_discussion_agent_requests(channel_slug);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_03_20261018 ON public.fast_discussion_agent_requests(response_message_id);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_04_20261018 ON public.fast_discussion_collaboration_cases(helper_agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_05_20261018 ON public.fast_discussion_collaboration_cases(initiator_agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_06_20261018 ON public.fast_discussion_collaboration_exchanges(from_agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_07_20261018 ON public.fast_discussion_collaboration_exchanges(to_agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_08_20261018 ON public.fast_discussion_collaboration_reviews(reviewer_agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_09_20261018 ON public.fast_discussion_collaboration_reviews(subject_agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_10_20261018 ON public.fast_discussion_messages(agent_code);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_11_20261018 ON public.fast_discussion_problem_events(case_id);
CREATE INDEX IF NOT EXISTS dsi_cov_fk_12_20261018 ON public.fast_discussion_reports(agent_code);
