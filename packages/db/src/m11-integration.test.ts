/**
 * Milestone 11 — consolidated integration coverage for critical paths.
 * Uses real SQLite + in-memory tenancy. Does not fabricate provider success.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  signRazorpayWebhook,
  signStripeWebhook,
  signWebhookPayload,
  verifyWebhookSignature,
  validateStructuredOutput,
  hasPermission,
  sanitizePageDocument,
} from "@leadorbit/domain";
import {
  AuthError,
  LocalTenancyStore,
  CrmStore,
  CampaignStore,
  IngestionStore,
  WorkflowStore,
  CalendarStore,
  BillingStore,
  SqliteJobQueue,
  openCrmDatabase,
} from "@leadorbit/db";

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "lo-m11-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const crm = new CrmStore(tenancy, db);
  const campaigns = new CampaignStore(tenancy, db, crm);
  const ingestion = new IngestionStore(tenancy, db, crm);
  const workflows = new WorkflowStore(tenancy, db, queue, crm);
  const calendar = new CalendarStore(tenancy, db, queue);
  const billing = new BillingStore(tenancy, db);
  return {
    db,
    tenancy,
    queue,
    crm,
    campaigns,
    ingestion,
    workflows,
    calendar,
    billing,
  };
}

test("auth + roles: viewer forbidden from billing write; owner allowed", async () => {
  const { tenancy, billing } = harness();
  const owner = await tenancy.signUp({
    email: `owner-${Date.now()}@ex.com`,
    password: "password123",
  });
  const viewer = await tenancy.signUp({
    email: `viewer-${Date.now()}@ex.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Role Co" });
  const invite = await tenancy.createInvite(
    owner,
    org.id,
    viewer.email,
    "viewer",
  );
  await tenancy.acceptInvite(viewer, invite.token!);

  assert.equal(hasPermission("viewer", "org:billing"), false);
  assert.equal(hasPermission("owner", "org:billing"), true);

  await assert.rejects(
    () =>
      billing.startCheckout(viewer, org.id, {
        planCode: "starter_monthly",
        provider: "stripe",
      }),
    (e: unknown) => e instanceof AuthError && e.code === "forbidden",
  );

  const checkout = await billing.startCheckout(owner, org.id, {
    planCode: "starter_monthly",
    provider: "stripe",
  });
  assert.equal(checkout.status, "pending_configuration");
});

test("tenant isolation: bob cannot list alice leads or campaigns", async () => {
  const { tenancy, crm, campaigns } = harness();
  const alice = await tenancy.signUp({
    email: `alice-${Date.now()}@ex.com`,
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: `bob-${Date.now()}@ex.com`,
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, { name: "Org A" });
  await tenancy.createOrganization(bob, { name: "Org B" });
  crm.registerOrg(orgA.id, orgA.name);
  await crm.createLead(alice, orgA.id, {
    fullName: "Secret",
    email: "secret@x.com",
  });
  await campaigns.createCampaign(alice, orgA.id, { name: "Private" });

  await assert.rejects(
    () => crm.listLeads(bob, orgA.id),
    (e: unknown) => e instanceof AuthError && e.code === "forbidden",
  );
  await assert.rejects(
    () => campaigns.listCampaigns(bob, orgA.id),
    (e: unknown) => e instanceof AuthError && e.code === "forbidden",
  );
});

test("lead creation + duplicate idempotency", async () => {
  const { tenancy, crm } = harness();
  const owner = await tenancy.signUp({
    email: `lead-${Date.now()}@ex.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Leads" });
  crm.registerOrg(org.id, org.name);
  const a = await crm.createLead(owner, org.id, {
    fullName: "Dup",
    email: "dup@x.com",
    idempotencyKey: "dup-1",
  });
  const b = await crm.createLead(owner, org.id, {
    fullName: "Dup2",
    email: "dup@x.com",
    idempotencyKey: "dup-1",
  });
  assert.equal(a.id, b.id);
});

test("campaign attribution events + form publish + page sanitize", async () => {
  const { tenancy, crm, campaigns } = harness();
  const owner = await tenancy.signUp({
    email: `camp-${Date.now()}@ex.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Attr" });
  crm.registerOrg(org.id, org.name);
  const campaign = await campaigns.createCampaign(owner, org.id, {
    name: "Spring",
    utmSource: "meta",
    utmMedium: "cpc",
  });
  const form = await campaigns.createForm(owner, org.id, {
    name: "Lead form",
    campaignId: campaign.id,
  });
  const publishedForm = await campaigns.updateForm(owner, org.id, form.id, {
    status: "published",
  });
  assert.equal(publishedForm.status, "published");
  assert.ok(campaigns.getPublishedForm(org.id, form.id));

  const dirty = sanitizePageDocument({
    version: 1,
    seo: { title: "t", description: "", ogImage: null },
    consentNotice: "c",
    blocks: [
      { id: "1", type: "hero", props: { headline: "Hi", onerror: "alert(1)" } },
      { id: "2", type: "script", props: { code: "alert(1)" } },
    ],
  });
  assert.ok(!dirty.blocks.some((b) => (b as { type: string }).type === "script"));
  assert.equal(dirty.blocks.length, 1);

  const page = await campaigns.createPage(owner, org.id, {
    name: "Landing",
    slug: `spring-${Date.now()}`,
    campaignId: campaign.id,
    formId: form.id,
    document: dirty,
  });
  const published = await campaigns.publishPage(owner, org.id, page.id);
  assert.equal(published.status, "published");

  await campaigns.trackEvent(owner, org.id, {
    campaignId: campaign.id,
    eventType: "page_view",
  });
  const perf = await campaigns.campaignPerformance(owner, org.id, campaign.id);
  assert.ok(perf.pageViews >= 1);
});

test("workflow execution + job retry/failure dead-letter", async () => {
  const { tenancy, crm, workflows, queue, db } = harness();
  const owner = await tenancy.signUp({
    email: `wf-${Date.now()}@ex.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "WF" });
  crm.registerOrg(org.id, org.name);
  const lead = await crm.createLead(owner, org.id, {
    fullName: "WF Lead",
    email: "wf@x.com",
  });
  const wf = await workflows.createWorkflow(owner, org.id, {
    name: "Nurture",
    template: "lead_created",
    testMode: true,
  });
  await workflows.publishWorkflow(owner, org.id, wf.id);
  const enrolled = await workflows.enroll(owner, org.id, {
    workflowId: wf.id,
    leadId: lead.id,
    idempotencyKey: "wf-1",
    testMode: true,
  });
  for (let i = 0; i < 12; i++) {
    await workflows.processTick(org.id, enrolled.enrollment.id);
  }
  const steps = await workflows.listStepRuns(
    owner,
    org.id,
    enrolled.enrollment.id,
  );
  assert.ok(steps.length >= 1);

  const job = queue.enqueue("lead.score", { orgId: org.id, leadId: lead.id });
  const [firstClaim] = queue.claimDue(1);
  assert.ok(firstClaim);
  queue.fail(job.jobId, "transient", { retryDelayMs: 0 });
  db.prepare(`update durable_jobs set run_at=? where id=?`).run(
    new Date(0).toISOString(),
    job.jobId,
  );
  const [secondClaim] = queue.claimDue(1);
  assert.ok(secondClaim);
  queue.fail(job.jobId, "fatal", { deadLetter: true });
  const row = db
    .prepare(`select status from durable_jobs where id=?`)
    .get(job.jobId) as { status: string };
  assert.equal(row.status, "dead_letter");
});

test("CRM stage transition", async () => {
  const { tenancy, crm } = harness();
  const owner = await tenancy.signUp({
    email: `crm-${Date.now()}@ex.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "CRM" });
  crm.registerOrg(org.id, org.name);
  const lead = await crm.createLead(owner, org.id, {
    fullName: "Stage",
    email: "stage@x.com",
  });
  const pipelines = crm.ensureDefaultPipelines(org.id);
  const stages = await crm.listStages(owner, org.id, pipelines.lead.id);
  assert.ok(stages.length >= 2);
  const next = stages[1]!;
  const updated = await crm.updateLeadStage(owner, org.id, lead.id, next.id);
  assert.equal(updated.stageId, next.id);
});

test("appointment conflict prevention", async () => {
  const { tenancy, calendar } = harness();
  const owner = await tenancy.signUp({
    email: `cal-${Date.now()}@ex.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Cal" });
  const type = await calendar.createAppointmentType(owner, org.id, {
    name: "Demo",
    durationMinutes: 30,
  });
  const start = new Date(Date.now() + 3600_000).toISOString();
  await calendar.bookAppointment(owner, org.id, {
    appointmentTypeId: type.id,
    assigneeUserId: owner.id,
    startsAt: start,
    title: "First",
  });
  await assert.rejects(
    () =>
      calendar.bookAppointment(owner, org.id, {
        appointmentTypeId: type.id,
        assigneeUserId: owner.id,
        startsAt: start,
        title: "Conflict",
      }),
    (e: unknown) => e instanceof AuthError,
  );
});

test("AI structured output validation", () => {
  const schema = {
    type: "object",
    required: ["qualification", "score"],
    properties: {
      qualification: { type: "string", enum: ["hot", "warm", "cold"] },
      score: { type: "number" },
    },
  };
  assert.equal(
    validateStructuredOutput({ qualification: "hot", score: 80 }, schema).ok,
    true,
  );
  assert.equal(
    validateStructuredOutput({ qualification: "boiling", score: "x" }, schema)
      .ok,
    false,
  );
});

test("webhook security + billing idempotency + entitlements", async () => {
  const { tenancy, billing, ingestion } = harness();
  const owner = await tenancy.signUp({
    email: `bill-${Date.now()}@ex.com`,
    password: "password123",
  });
  tenancy.bootstrapPlatformAdmin(owner.id);
  const admin = (await tenancy.getUser(owner.id))!;
  const org = await tenancy.createOrganization(admin, { name: "Bill" });
  billing.ensureTrialSubscription(org.id);

  assert.equal(
    (await billing.assertEntitled(admin, org.id, "analytics")).allowed,
    true,
  );
  assert.equal(
    (await billing.assertEntitled(admin, org.id, "white_label")).allowed,
    false,
  );

  // Ingestion webhook signature reject tampering
  const ts = String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify({ email: "a@b.com" });
  const secret = "ingest_sec";
  const sig = signWebhookPayload(secret, ts, raw);
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: raw,
      signature: sig,
    }).ok,
    true,
  );
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: raw,
      signature: "bad",
    }).ok,
    false,
  );

  const stripeBody = JSON.stringify({ id: "evt_m11", type: "invoice.paid" });
  const stripeSecret = "whsec_m11";
  const stripeSig = signStripeWebhook(stripeBody, stripeSecret);
  const first = billing.processWebhookForTests({
    provider: "stripe",
    eventId: "evt_m11",
    eventType: "invoice.paid",
    orgId: org.id,
    rawBody: stripeBody,
    signatureHeader: stripeSig,
    secret: stripeSecret,
  });
  assert.equal(first.duplicate, false);
  assert.equal(first.subscription?.status, "active");
  const second = billing.processWebhookForTests({
    provider: "stripe",
    eventId: "evt_m11",
    eventType: "invoice.paid",
    orgId: org.id,
    rawBody: stripeBody,
    signatureHeader: stripeSig,
    secret: stripeSecret,
  });
  assert.equal(second.duplicate, true);

  const rzBody = '{"event":"payment.captured","id":"rzp1"}';
  const bad = billing.processWebhookForTests({
    provider: "razorpay",
    eventId: "rzp1",
    eventType: "payment.captured",
    orgId: org.id,
    rawBody: rzBody,
    signatureHeader: "nope",
    secret: "rzp_sec",
  });
  assert.equal(bad.accepted, false);
  assert.equal(typeof signRazorpayWebhook, "function");

  // Cross-tenant ingestion list forbidden
  const stranger = await tenancy.signUp({
    email: `str-${Date.now()}@ex.com`,
    password: "password123",
  });
  await assert.rejects(
    () => ingestion.listIngestionEvents(stranger, org.id),
    (e: unknown) => e instanceof AuthError && e.code === "forbidden",
  );
});
