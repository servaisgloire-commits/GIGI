"""Regression checks for DSI RLS performance migrations. Static checks only.

Live database advisories and authenticated-role permission tests remain required.
"""
from pathlib import Path
import os
import re
import unittest

ORG = os.environ.get("GITHUB_REPOSITORY", "")
FAST = "GIGI-Talon-Congo" not in ORG
MIGRATION = Path("supabase/migrations/202610182030_dsi_fast_rls_initplan.sql" if FAST
                 else "supabase/migrations/202610182030_dsi_talent_needs_rls_union.sql")

class TestRlsPolicies(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.body = "\n".join(line for line in cls.sql.splitlines()
                             if not line.strip().startswith("--"))
        cls.statements = [s.strip() for s in cls.body.split(";") if s.strip()]

    def test_no_table_data_or_privilege_mutations(self):
        self.assertNotRegex(self.body, r"(?i)\b(DELETE\s+FROM|DROP\s+TABLE|TRUNCATE|GRANT|REVOKE|UPDATE\s+public\.|INSERT\s+INTO)\b")

    def test_expected_changes_only(self):
        if FAST:
            expected = {
                "fast_collab_cases_propose", "fast_discussion_members_insert",
                "fast_discussion_members_select", "fast_discussion_messages_insert",
                "fast_discussion_requests_insert",
            }
            actual = re.findall(r'ALTER POLICY "([^"]+)" ON public\.',self.body)
            self.assertEqual(set(actual),expected)
            self.assertEqual(len(self.statements),5)
            self.assertGreaterEqual(self.body.lower().count("select auth.jwt()"),5)
            self.assertNotRegex(self.body,r"(?<!select )auth\.jwt\(\)")
        else:
            self.assertEqual(len(self.statements),2)
            self.assertIn("ALTER POLICY tc_rls_merged_tc_needs_select",self.body)
            self.assertIn("private.tc_is_admin()",self.body)
            self.assertIn("private.tc_has_admin_role(",self.body)
            self.assertIn("company_account_id",self.body)
            self.assertIn("DROP POLICY IF EXISTS tc_needs_rh_workflow_read",self.body)

if __name__=="__main__":
    unittest.main()
