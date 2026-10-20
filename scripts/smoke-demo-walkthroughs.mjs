#!/usr/bin/env node
/**
 * API-level smoke of marketing + real-estate friend walkthroughs.
 * Requires a running AUTH_MODE=local server and (optionally) .data/demo-seed.json.
 *
 *   pnpm demo:seed && pnpm demo:smoke
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.LEADORBIT_BASE_URL || "http://127.0.0.1:43127").replace(
  /\/$/,
  "",
);
const SEED_FILE = join(process.cwd(), ".data", "demo-seed.json");

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  const nextCookie = parseCookies(res) || cookie || "";
  return { ok: res.ok, status: res.status, data, cookie: nextCookie };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(email, password) {
  const res = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert(res.ok, `login failed for ${email}: ${res.status}`);
  return res.cookie;
}

async function smokeMarketing(seed) {
  const cookie = await login(seed.marketing.email, seed.marketing.password);
  const orgId = seed.marketing.orgId;

  const campaigns = await api(`/api/v1/orgs/${orgId}/campaigns`, { cookie });
  assert(campaigns.ok, `campaigns ${campaigns.status}`);
  assert(
    (campaigns.data.items?.length ?? 0) >= 1,
    "expected at least one campaign from Launch Pack",
  );

  const leads = await api(`/api/v1/orgs/${orgId}/leads`, { cookie });
  assert(leads.ok, `leads ${leads.status}`);
  assert((leads.data.items?.length ?? 0) >= 2, "expected seeded marketing leads");

  const pub = await fetch(`${BASE}${seed.marketing.publicPath}`);
  assert(pub.ok, `public page ${pub.status}`);

  const submit = await api(
    `/api/v1/public/forms/${orgId}/${seed.marketing.formId}/submit`,
    {
      method: "POST",
      body: {
        payload: {
          fullName: `Smoke Lead ${Date.now()}`,
          email: `smoke.${Date.now()}@example.com`,
          phone: "+919900000001",
          consent: true,
        },
        campaignId: seed.marketing.campaignId,
        pageId: undefined,
      },
    },
  );
  assert(submit.ok, `public submit ${submit.status}: ${submit.data.detail || ""}`);

  const analytics = await api(`/api/v1/orgs/${orgId}/analytics`, { cookie });
  assert(analytics.ok, `analytics ${analytics.status}`);

  const resultsPage = await fetch(`${BASE}/app/orgs/${orgId}/results`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert(
    resultsPage.status === 200 || resultsPage.status === 307 || resultsPage.status === 302,
    `results UI unexpected status ${resultsPage.status}`,
  );

  return {
    persona: "marketing",
    campaigns: campaigns.data.items.length,
    leads: leads.data.items.length,
    publicPath: seed.marketing.publicPath,
    publicOk: pub.ok,
    submitOk: submit.ok,
    analyticsOk: analytics.ok,
  };
}

async function smokeRealEstate(seed) {
  const cookie = await login(seed.realEstate.email, seed.realEstate.password);
  const orgId = seed.realEstate.orgId;

  const mod = await api(`/api/v1/orgs/${orgId}/real-estate/module`, { cookie });
  assert(mod.ok, `RE module ${mod.status}`);
  assert(mod.data.enabled === true, "real-estate module should be enabled");

  const inv = await api(`/api/v1/orgs/${orgId}/real-estate/inventory`, {
    cookie,
  });
  assert(inv.ok, `inventory ${inv.status}`);
  assert(
    (inv.data.developers?.length ?? 0) >= 1 &&
      (inv.data.projects?.length ?? 0) >= 1,
    "inventory should include developer + project",
  );

  const enq = await api(`/api/v1/orgs/${orgId}/real-estate/enquiries`, {
    cookie,
  });
  assert(enq.ok, `enquiries ${enq.status}`);
  assert((enq.data.items?.length ?? 0) >= 1, "expected seeded enquiry");

  const leads = await api(`/api/v1/orgs/${orgId}/leads`, { cookie });
  assert(leads.ok, `leads ${leads.status}`);
  assert((leads.data.items?.length ?? 0) >= 1, "expected broker lead");

  return {
    persona: "real-estate",
    enquiries: enq.data.items.length,
    leads: leads.data.items.length,
    module: mod.data,
  };
}

async function main() {
  const health = await fetch(`${BASE}/api/v1/health`);
  assert(health.ok, `Server not healthy at ${BASE}`);
  const healthJson = await health.json();
  console.log(`Health ok · authMode=${healthJson.authMode}`);

  if (!existsSync(SEED_FILE)) {
    console.log("No .data/demo-seed.json — running seed first…");
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("node", ["scripts/seed-demo-orgs.mjs"], {
      stdio: "inherit",
      env: process.env,
    });
    assert(r.status === 0, "demo:seed failed");
  }

  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
  const m = await smokeMarketing(seed);
  const r = await smokeRealEstate(seed);

  console.log("\n=== demo:smoke passed ===");
  console.log(JSON.stringify({ marketing: m, realEstate: r }, null, 2));
  console.log("\nUI checks still needed: sidebar Advanced/Expert → Real estate;");
  console.log("Marketing → Launch Pack / public page → Leads → Results.");
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err.message || err);
  process.exit(1);
});
