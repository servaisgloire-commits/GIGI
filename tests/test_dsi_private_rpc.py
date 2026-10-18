import pathlib
import re
import unittest

MIGRATIONS = pathlib.Path("supabase/migrations")
FAST = MIGRATIONS / "202610181945_dsi_fast_private_rpc.sql"
TALENT = MIGRATIONS / "202610181945_dsi_talent_private_membership.sql"

class PrivilegedRpcChecks(unittest.TestCase):
    def test_expected_migration(self):
        candidates = [p for p in [FAST, TALENT] if p.exists()]
        self.assertEqual(len(candidates), 1, "exactly one project-specific migration expected")
        self.sql = candidates[0].read_text(encoding="utf-8")
        self.assertNotRegex(self.sql, r"(?i)\bDROP\s+(?:TABLE|SCHEMA)\b")
        self.assertNotRegex(self.sql, r"(?i)\bDELETE\s+FROM\b|\bTRUNCATE\b")
        if candidates[0] == FAST:
            self.assertIn("CREATE SCHEMA IF NOT EXISTS dsi_privileged", self.sql)
            for name in ["is_fast_admin","get_ride_security_state","issue_ride_pin","verify_ride_pin"]:
                self.assertIn("dsi_privileged." + name, self.sql)
                self.assertIn("public." + name, self.sql)
            self.assertIn("TO authenticated,service_role",self.sql)
        else:
            self.assertIn("private.dsi_tc_comm_active_internal()", self.sql)
            self.assertIn("private.dsi_tc_comm_founder_internal()", self.sql)
            self.assertIn("public.tc_comm_is_active()", self.sql)
            self.assertIn("public.tc_comm_is_founder()", self.sql)
            self.assertIn("SECURITY DEFINER", self.sql)  # private functions only
            self.assertIn("TO authenticated,service_role", self.sql)
        # All public wrapper declarations must be invokers (default or explicit).
        chunks = re.split(r"(?=CREATE OR REPLACE FUNCTION public\.)",self.sql,flags=re.I)
        for chunk in chunks[1:]:
            declaration=chunk.split("AS $",1)[0]
            self.assertNotIn("SECURITY DEFINER", declaration.upper())
            self.assertIn("SET search_path", declaration)
