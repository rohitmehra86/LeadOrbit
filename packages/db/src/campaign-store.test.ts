import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { CrmStore } from "./crm-store";
import { CampaignStore } from "./campaign-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-mkt-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const crm = new CrmStore(tenancy, db);
  const mkt = new CampaignStore(tenancy, db, crm);
  return { tenancy, crm, mkt };
}

test("cross-tenant campaign list forbidden", async () => {
  const { tenancy, mkt } = setup();
  const alice = await tenancy.signUp({
    email: "a-mkt@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "b-mkt@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, {
    name: "Org A Marketing",
  });
  await tenancy.createOrganization(bob, { name: "Org B Marketing" });
  await mkt.createCampaign(alice, orgA.id, { name: "Spring" });

  await assert.rejects(
    () => mkt.listCampaigns(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("form submit persists to tenant and creates lead; duplicate detected", async () => {
  const { tenancy, crm, mkt } = setup();
  const owner = await tenancy.signUp({
    email: "owner-mkt@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Funnel Co" });
  crm.registerOrg(org.id, org.name);
  const campaign = await mkt.createCampaign(owner, org.id, {
    name: "Open House",
    objective: "lead_gen",
  });
  const form = await mkt.createForm(owner, org.id, {
    name: "Tour form",
    campaignId: campaign.id,
    templateKey: "lead_gen",
  });
  await mkt.updateForm(owner, org.id, form.id, { status: "published" });

  const sub = await mkt.submitFormPublic({
    orgId: org.id,
    formId: form.id,
    payload: {
      fullName: "Pat Buyer",
      email: "pat@example.com",
      phone: "5551234",
      consent: true,
      budget: "$500k–$1M",
    },
    utm: { utmSource: "meta", utmMedium: "cpc", utmCampaign: "open-house" },
  });
  assert.equal(sub.orgId, org.id);
  assert.equal(sub.campaignId, campaign.id);
  assert.ok(sub.leadId);
  assert.equal(sub.duplicateOfId, null);

  const dup = await mkt.submitFormPublic({
    orgId: org.id,
    formId: form.id,
    payload: {
      fullName: "Pat Buyer",
      email: "pat@example.com",
      phone: "5551234",
      consent: true,
    },
  });
  assert.equal(dup.duplicateOfId, sub.id);

  const leads = await crm.listLeads(owner, org.id);
  assert.equal(leads.length, 1);

  await mkt.trackEvent(owner, org.id, {
    campaignId: campaign.id,
    eventType: "page_view",
  });
  const perf = await mkt.campaignPerformance(owner, org.id, campaign.id);
  assert.ok(perf.pageViews >= 1);
  assert.ok(perf.conversions >= 1 || perf.formSubmits >= 1);
});

test("page publish + sanitize; ad network pending without credentials", async () => {
  const { tenancy, mkt } = setup();
  const owner = await tenancy.signUp({
    email: "pages-mkt@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Pages Co" });
  const page = await mkt.createPage(owner, org.id, {
    name: "RE Landing",
    templateKey: "real_estate",
  });
  assert.ok(page.document.blocks.some((b) => b.type === "hero"));
  const published = await mkt.publishPage(owner, org.id, page.id);
  assert.equal(published.status, "published");
  const publicPage = mkt.getPublishedPageBySlug(org.id, page.slug);
  assert.ok(publicPage);

  const integ = await mkt.authorizeAdNetwork(owner, org.id, "meta");
  assert.equal(integ.status, "pending_configuration");

  const ai = mkt.suggestCopy("Write short ad");
  assert.equal(ai.status, "unverified");
});
