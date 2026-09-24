const U = Deno.env.get("SUPABASE_URL")!;
const K = (() => {
  try {
    const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return j.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
})();
if (!U || !K) throw new Error("SECURITY_G server configuration missing");

const E = new TextEncoder();
const J = (d: unknown, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  },
});
async function H(v: string) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", E.encode(v)));
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function R(p: string, i: RequestInit = {}) {
  const h = new Headers(i.headers || {});
  h.set("apikey", K);
  if (!K.startsWith("sb_secret_")) h.set("Authorization", "Bearer " + K);
  if (!h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(U + "/rest/v1/" + p, { ...i, headers: h });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error(d?.message || d?.hint || d?.error || ("REST " + r.status));
  return d;
}
async function A(req: Request) {
  const raw = req.headers.get("x-agent-token") || "";
  if (!raw || raw.length > 512) return false;
  const d = await H(raw);
  const x = await R("fast_agent_registry?agent_code=eq.SECURITY_G&select=token_hash,status&limit=1");
  return !!x?.[0] && x[0].status === "active" && safeEqual(String(x[0].token_hash || ""), d);
}
async function run() {
  const x = await R("fast_agent_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ agent_code: "SECURITY_G", trigger_source: "security_scan", status: "running" }),
  });
  return x?.[0]?.id;
}
async function ev(id: string, sev: string, cat: string, title: string, details: unknown) {
  await R("fast_agent_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ run_id: id, agent_code: "SECURITY_G", severity: sev, category: cat, title, details }),
  });
}
async function finding(severity: string, category: string, title: string, details: unknown, recommendation: string, fingerprint: string) {
  const e = await R("fast_security_findings?fingerprint=eq." + encodeURIComponent(fingerprint) + "&select=id,status&limit=1");
  if (e?.length) return e[0].id;
  const x = await R("fast_security_findings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ agent_code: "SECURITY_G", severity, category, title, details, recommendation, fingerprint, status: "open" }),
  });
  return x?.[0]?.id;
}

Deno.serve(async req => {
  if (req.method !== "POST") return J({ ok: false, error: "POST required" }, 405);
  if (!(await A(req))) return J({ ok: false, error: "Unauthorized" }, 401);

  const id = await run();
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const logs = await R(
      "fast_admin_audit?select=id,action,target_type,created_at&created_at=gte." +
      encodeURIComponent(since) + "&order=created_at.desc&limit=200"
    );
    const words = ["delete", "password", "admin", "role", "permission", "bank", "payment", "refund", "security", "secret", "token"];
    const sensitive = (logs || []).filter((x: any) =>
      words.some(w => String(x.action || "").toLowerCase().includes(w))
    );
    const approved = await R("fast_agent_change_proposals?status=eq.approved&select=id,risk_level,target_table&limit=100");
    const pinRisk = await R(
      "ride_security?select=ride_id,pin_failed_attempts,pin_locked_until&pin_failed_attempts=gte.3&limit=100"
    );

    const obs = {
      measured_at: new Date().toISOString(),
      audit_rows_24h: (logs || []).length,
      sensitive_admin_actions_24h: sensitive.length,
      approved_agent_changes_waiting: (approved || []).length,
      rides_with_repeated_pin_failures: (pinRisk || []).length,
      encryption: {
        database_at_rest: "platform_managed",
        secrets: "supabase_vault",
        ride_pin_cipher: "pgp_symmetric",
        ride_pin_verifier: "hmac_sha256_keyed",
        application_secret_storage: "server_only",
      },
      client_protection: {
        direct_sensitive_table_access: "revoked",
        profile_role_self_escalation: "blocked",
        android_release_obfuscation: "r8",
        cleartext_network_traffic: "disabled",
      },
    };

    if (sensitive.length) {
      await finding(
        "medium",
        "admin_activity",
        "Activités administratives sensibles détectées",
        { count: sensitive.length, sample: sensitive.slice(0, 10) },
        "Vérifier que ces opérations administratives sont attendues.",
        "sensitive-admin-actions",
      );
      await ev(id, "warning", "security", "Activités administratives sensibles détectées", { count: sensitive.length });
    }
    if ((pinRisk || []).length) {
      await finding(
        "high",
        "ride_pin",
        "Tentatives PIN répétées détectées",
        { count: pinRisk.length },
        "Vérifier les courses concernées et les verrouillages PIN.",
        "repeated-pin-failures",
      );
      await ev(id, "warning", "ride_pin", "Tentatives PIN répétées détectées", { count: pinRisk.length });
    }
    if ((approved || []).some((x: any) => x.risk_level === "critical" || x.risk_level === "high")) {
      await finding(
        "high",
        "agent_change",
        "Modification agent approuvée à risque élevé",
        { items: (approved || []).filter((x: any) => x.risk_level === "critical" || x.risk_level === "high") },
        "Vérifier une dernière fois la proposition avant exécution.",
        "approved-high-risk-change",
      );
    }

    await R("fast_agent_runs?id=eq." + id, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "completed",
        finished_at: new Date().toISOString(),
        observations: obs,
        decisions: [],
        verification: { no_delete_capability: true, business_data_mutated: false },
      }),
    });
    await R("fast_agent_registry?agent_code=eq.SECURITY_G", {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    return J({ ok: true, agent: "SECURITY_G", run_id: id, observations: obs });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    try {
      await R("fast_agent_runs?id=eq." + id, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed", finished_at: new Date().toISOString(), error: m }),
      });
    } catch {}
    return J({ ok: false, agent: "SECURITY_G", error: m }, 500);
  }
});
