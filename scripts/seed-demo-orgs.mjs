#!/usr/bin/env node
/**
 * Seed two independent demo workspaces against a running local server
 * (AUTH_MODE=local — tenancy is in-process memory, so this must hit HTTP).
 *
 * Usage:
 *   pnpm demo:seed
 *   LEADORBIT_BASE_URL=http://127.0.0.1:43127 node scripts/seed-demo-orgs.mjs
 *
 * Prints emails, org ids, and public capture URL. Passwords are printed once
 * for local demos only — friends should prefer /signup for their own accounts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.LEADORBIT_BASE_URL || "http://127.0.0.1:43127").replace(
  /\/$/,
  "",
);
const stamp = Date.now();
const OUT_DIR = join(process.cwd(), ".data");
const OUT_FILE = join(OUT_DIR, "demo-seed.json");

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return single.split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).join("; ");
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
    data = { raw: text };
  }
  const nextCookie = parseCookies(res) || cookie || "";
  if (!res.ok) {
    const detail = data.detail || data.title || text.slice(0, 200);
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return { data, cookie: nextCookie, status: res.status };
}

async function signup(email, password, fullName) {
  const { data, cookie } = await api("/api/v1/auth/signup", {
    method: "POST",
    body: { email, password, fullName },
  });
  return { user: data.user, cookie };
}

async function createOrg(cookie, name, orgType = "workspace") {
  const { data, cookie: c } = await api("/api/v1/orgs", {
    method: "POST",
    cookie,
    body: { name, orgType, timezone: "Asia/Kolkata", currency: "INR" },
  });
  return { org: data.item, cookie: c };
}

async function seedMarketing(cookie) {
  const { org, cookie: c0 } = await createOrg(
    cookie,
    "Marketing Demo Agency",
    "agency",
  );
  let cookieJar = c0;

  // Launch Pack via marketplace install + publish
  const { data: installed, cookie: c1 } = await api(
    `/api/v1/orgs/${org.id}/marketplace`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "install",
        packId: "general-lead-gen",
        publish: true,
      },
    },
  );
  cookieJar = c1;
  const pack = installed.launchPack;

  // Extra sample leads
  for (const lead of [
    {
      fullName: "Priya Nair",
      email: `priya.demo.${stamp}@example.com`,
      phone: "+919800000001",
      source: "form",
      territory: "Bangalore",
    },
    {
      fullName: "Arjun Mehta",
      email: `arjun.demo.${stamp}@example.com`,
      phone: "+919800000002",
      source: "manual",
      territory: "Mumbai",
    },
  ]) {
    const { cookie: c } = await api(`/api/v1/orgs/${org.id}/leads`, {
      method: "POST",
      cookie: cookieJar,
      body: lead,
    });
    cookieJar = c;
  }

  // Public form submit (anonymous) — keys match Launch Pack form fields
  await api(`/api/v1/public/forms/${org.id}/${pack.formId}/submit`, {
    method: "POST",
    body: {
      payload: {
        fullName: "Walk-in Lead",
        email: `walkin.${stamp}@example.com`,
        phone: "+919800000099",
        consent: true,
      },
      utm: {
        utm_source: "demo",
        utm_medium: "walkthrough",
        utm_campaign: "marketing-friend",
      },
      campaignId: pack.campaignId,
      pageId: pack.pageId,
    },
  });

  return {
    orgId: org.id,
    orgName: org.name,
    publicPath: pack.publicPath,
    formId: pack.formId,
    pageSlug: pack.pageSlug,
    campaignId: pack.campaignId,
  };
}

async function seedRealEstate(cookie) {
  const { org, cookie: c0 } = await createOrg(cookie, "Demo Realty Brokers", "workspace");
  let cookieJar = c0;

  const { cookie: c1 } = await api(`/api/v1/orgs/${org.id}/real-estate/module`, {
    method: "PATCH",
    cookie: cookieJar,
    body: { templateId: "real_estate", enabled: true },
  });
  cookieJar = c1;

  const { data: devRes, cookie: c2 } = await api(
    `/api/v1/orgs/${org.id}/real-estate/inventory`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "developer",
        name: "Horizon Developers",
        website: "https://example.com",
      },
    },
  );
  cookieJar = c2;
  const developerId = devRes.item.id;

  const { data: projRes, cookie: c3 } = await api(
    `/api/v1/orgs/${org.id}/real-estate/inventory`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "project",
        developerId,
        name: "Green Park Residences",
        location: "Whitefield",
        city: "Bangalore",
        amenities: ["pool", "gym", "clubhouse"],
      },
    },
  );
  cookieJar = c3;
  const projectId = projRes.item.id;

  const { data: propRes, cookie: c4 } = await api(
    `/api/v1/orgs/${org.id}/real-estate/inventory`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "property",
        projectId,
        name: "Tower A",
        propertyType: "apartment",
        address: "Whitefield, Bangalore",
      },
    },
  );
  cookieJar = c4;
  const propertyId = propRes.item.id;

  for (const unit of [
    { unitNumber: "A-1201", floor: 12, bhk: 3, price: 12000000 },
    { unitNumber: "A-805", floor: 8, bhk: 2, price: 8500000 },
    { unitNumber: "A-402", floor: 4, bhk: 2, price: 8200000 },
  ]) {
    const { cookie: c } = await api(
      `/api/v1/orgs/${org.id}/real-estate/inventory`,
      {
        method: "POST",
        cookie: cookieJar,
        body: {
          action: "unit",
          projectId,
          propertyId,
          ...unit,
          currency: "INR",
          status: "available",
          facing: "east",
        },
      },
    );
    cookieJar = c;
  }

  const { data: leadRes, cookie: c5 } = await api(`/api/v1/orgs/${org.id}/leads`, {
    method: "POST",
    cookie: cookieJar,
    body: {
      fullName: "Sneha Rao",
      email: `sneha.buyer.${stamp}@example.com`,
      phone: "+919811122233",
      source: "referral",
      territory: "Bangalore",
    },
  });
  cookieJar = c5;
  const leadId = leadRes.item.id;

  const { data: prefRes, cookie: c6 } = await api(
    `/api/v1/orgs/${org.id}/real-estate/enquiries`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "preferences",
        leadId,
        budgetMin: 7000000,
        budgetMax: 13000000,
        locations: ["Whitefield", "Bangalore"],
        bhkMin: 2,
        bhkMax: 3,
        mustHaveAmenities: ["gym"],
      },
    },
  );
  cookieJar = c6;

  const { data: enqRes, cookie: c7 } = await api(
    `/api/v1/orgs/${org.id}/real-estate/enquiries`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "create",
        leadId,
        projectId,
        preferenceId: prefRes.item.id,
        autoMatch: true,
        source: "demo_seed",
        message: "Looking for 2–3 BHK in Whitefield for family",
      },
    },
  );
  cookieJar = c7;
  const enquiryId = enqRes.enquiry?.id ?? enqRes.item?.id;
  if (!enquiryId) {
    throw new Error("create enquiry did not return an id");
  }

  // Site-visit appointment type + scheduled visit
  const { data: typeRes, cookie: c8 } = await api(
    `/api/v1/orgs/${org.id}/calendar/types`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        name: "Site visit",
        kind: "site_visit",
        durationMinutes: 60,
        requiresSiteVisit: true,
      },
    },
  );
  cookieJar = c8;
  const appointmentTypeId = typeRes.item.id;

  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const { cookie: c9 } = await api(
    `/api/v1/orgs/${org.id}/real-estate/enquiries`,
    {
      method: "POST",
      cookie: cookieJar,
      body: {
        action: "site_visit",
        enquiryId,
        appointmentTypeId,
        startsAt,
        siteVisitAddress: "Green Park Residences, Whitefield, Bangalore",
      },
    },
  );
  cookieJar = c9;

  return {
    orgId: org.id,
    orgName: org.name,
    projectId,
    leadId,
    enquiryId,
    appointmentTypeId,
  };
}

async function main() {
  const health = await fetch(`${BASE}/api/v1/health`);
  if (!health.ok) {
    throw new Error(
      `Server not healthy at ${BASE}. Start with: pnpm local:demo (or AUTH_MODE=local pnpm dev:web)`,
    );
  }
  const healthJson = await health.json();
  if (healthJson.authMode && healthJson.authMode !== "local") {
    console.warn(
      `Warning: authMode=${healthJson.authMode}. This seed targets AUTH_MODE=local.`,
    );
  }

  const marketingEmail = `marketing.demo.${stamp}@example.com`;
  const realtyEmail = `broker.demo.${stamp}@example.com`;
  const password = `DemoPass-${stamp.toString(36)}!`;

  const mSignup = await signup(marketingEmail, password, "Marketing Demo");
  const marketing = await seedMarketing(mSignup.cookie);

  const rSignup = await signup(realtyEmail, password, "Broker Demo");
  const realty = await seedRealEstate(rSignup.cookie);

  const result = {
    createdAt: new Date().toISOString(),
    baseUrl: BASE,
    authMode: healthJson.authMode ?? "local",
    note: "Local AUTH_MODE=local only. Friends can also /signup their own accounts.",
    marketing: {
      email: marketingEmail,
      password,
      ...marketing,
      urls: {
        app: `${BASE}/app/orgs/${marketing.orgId}/assistant`,
        marketing: `${BASE}/app/orgs/${marketing.orgId}/marketing`,
        results: `${BASE}/app/orgs/${marketing.orgId}/results`,
        publicCapture: `${BASE}${marketing.publicPath}`,
      },
    },
    realEstate: {
      email: realtyEmail,
      password,
      ...realty,
      urls: {
        app: `${BASE}/app/orgs/${realty.orgId}/assistant`,
        realEstate: `${BASE}/app/orgs/${realty.orgId}/real-estate`,
        leads: `${BASE}/app/orgs/${realty.orgId}/leads`,
        sales: `${BASE}/app/orgs/${realty.orgId}/sales`,
      },
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));

  console.log("\n=== LeadOrbit demo seed complete ===\n");
  console.log(`Saved: ${OUT_FILE}`);
  console.log("\nMarketing Demo Agency");
  console.log(`  Login:  ${BASE}/login`);
  console.log(`  Email:  ${marketingEmail}`);
  console.log(`  Pass:   ${password}`);
  console.log(`  Org:    ${marketing.orgName} (${marketing.orgId})`);
  console.log(`  Public: ${BASE}${marketing.publicPath}`);
  console.log("\nDemo Realty Brokers");
  console.log(`  Login:  ${BASE}/login`);
  console.log(`  Email:  ${realtyEmail}`);
  console.log(`  Pass:   ${password}`);
  console.log(`  Org:    ${realty.orgName} (${realty.orgId})`);
  console.log(`  RE UI:  ${BASE}/app/orgs/${realty.orgId}/real-estate`);
  console.log("\nTip: switch sidebar to Advanced/Expert to see Real estate.");
  console.log("Friends may instead create their own accounts on /signup.\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
