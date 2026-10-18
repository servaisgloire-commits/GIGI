-- DSI correction queue: FK lookup indexes. Applied in Supabase 2026-10-18.
-- Both tables were 32 kB at migration time; no data or policies changed.
CREATE INDEX IF NOT EXISTS dsi_patch_candidates_incident_cover ON dsi_ops.patch_candidates(incident_id);
CREATE INDEX IF NOT EXISTS dsi_test_results_candidate_cover ON dsi_ops.test_results(candidate_id);
