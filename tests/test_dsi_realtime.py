"""Static checks for DSI realtime Groq trigger and incident reopen history.

Complements (does not replace) live Supabase integration tests.
"""
from pathlib import Path
import re
import unittest

ROOT = Path("supabase/migrations")
BRIDGE = ROOT / "202610181900_dsi_realtime_bridge.sql"
REOPEN = ROOT / "202610181901_dsi_reopen_history.sql"
SKIP_FINAL = ROOT / "202610182000_dsi_skip_final_webhook.sql"
NOOP = ROOT / "202610182015_dsi_skip_idle_dispatch.sql"

class DsiRealtimeBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.b = BRIDGE.read_text(encoding="utf-8").lower()
        cls.r = REOPEN.read_text(encoding="utf-8").lower()
        cls.f = SKIP_FINAL.read_text(encoding="utf-8").lower()
        cls.n = NOOP.read_text(encoding="utf-8").lower()

    def test_event_driven_triggers(self):
        self.assertIn("after insert or update of state on dsi_ops.incidents", self.b)
        self.assertIn("after update of status on dsi_ops.agent_tasks", self.b)
        self.assertIn("new.status <> 'completed'", self.b)
        self.assertIn("old.state='open'", self.b)

    def test_secret_is_fetched_only_from_vault(self):
        self.assertIn("vault.decrypted_secrets", self.b)
        self.assertIn("name='dsi_dispatch_token_v1'", self.b)
        self.assertIn("jsonb_build_object('content-type','application/json','x-dsi-token',v_token)", self.b)
        self.assertNotRegex(self.b, r"(?i)(?:gsk_|sk-proj-)[a-z0-9_-]{16,}")

    def test_dispatch_is_fail_open_for_business_transaction(self):
        self.assertIn("exception when others then", self.b)
        self.assertIn("return new;", self.b)
        self.assertIn("net.http_post(", self.b)

    def test_reopens_preserve_previous_task_rows(self):
        self.assertIn("add column if not exists run_number", self.r)
        self.assertIn("unique (incident_id,stage,run_number)", self.r)
        self.assertIn("t.run_number=i.reopens", self.r)
        self.assertIn("prev.run_number=t.run_number", self.r)
        self.assertNotRegex(self.r, r"(?i)\b(?:truncate|delete from dsi_ops\.agent_tasks|drop table)\b")

    def test_skip_useless_fourth_llm_dispatch(self):
        self.assertIn("or new.stage='functional_test_plan'",self.n)
        self.assertIn("new.status <> 'completed'",self.n)
        self.assertIn("net.http_post(",self.n)
        self.assertIn("name='dsi_dispatch_token_v1'",self.n)


    def test_last_stage_does_not_waste_a_groq_request(self):
        self.assertIn("if new.stage='functional_test_plan' then return new; end if;", self.f)
        self.assertIn("net.http_post(", self.f)
        self.assertLess(self.f.index("if new.stage='functional_test_plan'"),self.f.index("net.http_post("))

    def test_privileged_rpcs_not_public(self):
        self.assertIn("revoke all on function dsi_ops.push_realtime_groq()",self.b)
        self.assertIn("revoke all on function public.dsi_agent_claim(text)",self.r)
        self.assertIn("grant execute on function public.dsi_agent_claim(text) to service_role",self.r)

if __name__ == "__main__":
    unittest.main()
