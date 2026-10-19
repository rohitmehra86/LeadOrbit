import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signWebhookPayload } from "@leadorbit/domain";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { CrmStore } from "./crm-store";
import { IngestionStore } from "./ingestion-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-ing-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const crm = new CrmStore(tenancy, db);
  const ing = new IngestionStore(tenancy, db, crm);
  return { tenancy, crm, ing, db };
}

test("cross-tenant ingestion events forbidden", async () => {
  const { tenancy, crm, ing } = setup();
  const alice = await tenancy.signUp({
    email: "a-ing@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "b-ing@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, {
    name: "Org A Ingest",
  });
  await tenancy.createOrganization(bob, { name: "Org B Ingest" });
  crm.registerOrg(orgA.id, orgA.name);
  await ing.ingestLead({
    orgId: orgA.id,
    channel: "webhook",
    email: "x@y.com",
    fullName: "X",
  });
  await assert.rejects(
    () => ing.listIngestionEvents(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("signed webhook ingest + idempotency + attribution linkage", async () => {
  const { tenancy, crm, ing, db } = setup();
  const owner = await tenancy.signUp({
    email: "owner-ing@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Ingest Co" });
  crm.registerOrg(org.id, org.name);

  // Seed campaign with known UTM
  const campId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into campaigns(
      id, org_id, name, objective, status, audience, ad_copy, landing_page_id, form_id,
      utm, budget, schedule_start, schedule_end, template_key, ab_test_enabled, ab_variants,
      attribution_model, created_at, updated_at
    ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    campId,
    org.id,
    "Spring",
    "lead_gen",
    "active",
    "{}",
    "copy",
    null,
    null,
    JSON.stringify({
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "spring",
    }),
    JSON.stringify({ currency: "USD", dailyCents: null, totalCents: null }),
    null,
    null,
    null,
    0,
    "[]",
    "last_touch",
    now,
    now,
  );

  const endpoint = await ing.createWebhookEndpoint(owner, org.id, {
    name: "Inbound CRM",
  });
  const body = JSON.stringify({
    fullName: "Jamie Lead",
    email: "jamie@example.com",
    phone: "5550001",
    eventId: "evt-1",
    utm_source: "meta",
    utm_medium: "cpc",
    utm_campaign: "spring",
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = signWebhookPayload(endpoint.secret, ts, body);

  const first = await ing.processInboundWebhook({
    orgId: org.id,
    endpointId: endpoint.id,
    rawBody: body,
    timestamp: ts,
    signature: sig,
  });
  assert.equal(first.duplicate, false);
  assert.ok(first.leadId);
  assert.equal(first.event.campaignId, campId);

  const second = await ing.processInboundWebhook({
    orgId: org.id,
    endpointId: endpoint.id,
    rawBody: body,
    timestamp: ts,
    signature: sig,
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.leadId, first.leadId);

  const attr = await ing.getLeadAttribution(owner, org.id, first.leadId!);
  assert.ok(attr.attribution);
  assert.equal(attr.attribution!.campaignId, campId);
  assert.ok(attr.touchpoints.length >= 1);

  // Bad signature
  await assert.rejects(
    () =>
      ing.processInboundWebhook({
        orgId: org.id,
        endpointId: endpoint.id,
        rawBody: body,
        timestamp: ts,
        signature: "sha256=00",
      }),
    (err: unknown) => err instanceof AuthError && err.code === "unauthorized",
  );

  const leads = await crm.listLeads(owner, org.id);
  assert.equal(leads.length, 1);

  const pull = await ing.pullLeadAds(owner, org.id, "meta_lead_ads");
  assert.equal(pull.status, "pending_configuration");
  assert.equal(pull.imported, 0);
});

test("delivery status sync scaffolds retries", async () => {
  const { tenancy, ing } = setup();
  const owner = await tenancy.signUp({
    email: "del-ing@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Delivery Co" });
  const d = await ing.enqueueOutboundDelivery(owner, org.id, {
    targetUrl: "https://example.com/hooks",
    payload: { hello: true },
  });
  assert.equal(d.status, "pending");
  const failed = await ing.syncDeliveryStatus(owner, org.id, d.id, {
    success: false,
    statusCode: 500,
  });
  assert.equal(failed.status, "retrying");
});
