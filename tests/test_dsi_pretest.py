"""DSI-001 code contract: safeguards only, NOT live incident execution proof."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/202610182130_dsi_001_pretest_gate.sql").read_text(encoding="utf-8").lower()
WORKER=(ROOT/"supabase/functions/dsi-agent-engine/index.ts").read_text(encoding="utf-8").lower()

class Dsi001Pretests(unittest.TestCase):
 def test_pretest_stage_constraint(self):
  self.assertIn("stage in ('diagnosis','pretest_functional','pretest_security','security_review','functional_test_plan')",SQL)
 def test_specialized_testers(self):
  self.assertIn("'pretest_functional','émile'",SQL)
  self.assertIn("'pretest_security','camille'",SQL)
 def test_pretests_happen_after_diagnosis(self):
  self.assertIn("prev.stage='diagnosis' and prev.status='completed'",SQL)
  self.assertIn("prev.stage='pretest_functional' and prev.status='completed'",SQL)
 def test_security_review_gated_by_real_evidence(self):
  self.assertIn("pf.passed=true and ps.passed=true",SQL)
  self.assertIn("ps.revision_sha=pf.revision_sha",SQL)
  self.assertIn("pf.source='github_actions' and ps.source='github_actions'",SQL)
  self.assertIn("pf.stage='pretest_functional' and ps.stage='pretest_security'",SQL)
 def test_result_table_not_public(self):
  self.assertIn("enable row level security",SQL)
  self.assertIn("revoke all on dsi_ops.pretest_results from public, anon, authenticated",SQL)
  self.assertIn("grant select, insert on dsi_ops.pretest_results to service_role",SQL)
  self.assertIn("revision_sha ~",SQL)
  self.assertIn("ci_run_url text not null",SQL)
 def test_keep_incident_history_and_no_automatic_merge(self):
  self.assertIn("on conflict(incident_id,stage,run_number) do nothing",SQL)
  for danger in ("truncate dsi_ops.","delete from dsi_ops.","drop table dsi_ops."):
   self.assertNotIn(danger,SQL)
  self.assertNotIn("auto_code_generation=true",SQL)
 def test_agent_runtime_understands_pretests(self):
  self.assertIn('"pretest_functional"',WORKER)
  self.assertIn('"pretest_security"',WORKER)
  self.assertIn("sans les exécuter",WORKER)
  self.assertIn("preuves ci vérifiées",WORKER)
 def test_legacy_stages_and_token_guard_preserved(self):
  self.assertIn("dsi_dispatch_token_v1",SQL)
  self.assertIn("dsi_agent_complete",WORKER)
  self.assertIn("security_review",WORKER)
  self.assertIn("functional_test_plan",WORKER)

if __name__=="__main__":unittest.main()
