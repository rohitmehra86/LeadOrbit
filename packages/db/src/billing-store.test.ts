import assert from "node:assert/strict";
import { test } from "node:test";
import {
  signRazorpayWebhook,
  signStripeWebhook
} from "@leadorbit/domain/server";
import { BillingStore } from "./billing-store";
import { LocalTenancyStore } from "./tenancy-store";
import { resetCrmDatabaseForTests } from "./sqlite";

async function setup() {
  resetCrmDatabaseForTests(":memory:");
  const tenancy = new LocalTenancyStore();
  const signed = await tenancy.signUp({
    email: `owner-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    fullName: "Owner",
  });
  tenancy.bootstrapPlatformAdmin(signed.id);
  const owner = (await tenancy.getUser(signed.id))!;
  const org = await tenancy.createOrganization(owner, {
    name: `Billing Co ${Math.random().toString(36).slice(2, 6)}`,
    orgType: "agency",
  });
  const billing = new BillingStore(tenancy);
  return { tenancy, owner, org, billing };
}

test("webhook idempotency — duplicate event_id is accepted once", async () => {
  const { org, billing } = await setup();
  billing.ensureTrialSubscription(org.id);
  const secret = "whsec_test_idem";
  const body = JSON.stringify({
    id: "evt_idem_1",
    type: "invoice.paid",
    data: { object: { metadata: { orgId: org.id } } },
  });
  const sig = signStripeWebhook(body, secret);

  const first = billing.processWebhookForTests({
    provider: "stripe",
    eventId: "evt_idem_1",
    eventType: "invoice.paid",
    orgId: org.id,
    rawBody: body,
    signatureHeader: sig,
    secret,
  });
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.subscription?.status, "active");

  const second = billing.processWebhookForTests({
    provider: "stripe",
    eventId: "evt_idem_1",
    eventType: "invoice.paid",
    orgId: org.id,
    rawBody: body,
    signatureHeader: sig,
    secret,
  });
  assert.equal(second.accepted, true);
  assert.equal(second.duplicate, true);

  const events = billing.listWebhookEvents(org.id) as Array<{ event_id: string }>;
  assert.equal(events.filter((e) => e.event_id === "evt_idem_1").length, 1);
});

test("razorpay webhook verifies and activates; rejects bad signature", async () => {
  const { org, billing } = await setup();
  billing.ensureTrialSubscription(org.id);
  const secret = "rzp_secret";
  const body = JSON.stringify({ event: "payment.captured", id: "evt_rzp_1" });
  const sig = signRazorpayWebhook(body, secret);

  const bad = billing.processWebhookForTests({
    provider: "razorpay",
    eventId: "evt_rzp_1",
    eventType: "payment.captured",
    orgId: org.id,
    rawBody: body,
    signatureHeader: "deadbeef",
    secret,
  });
  assert.equal(bad.accepted, false);

  const ok = billing.processWebhookForTests({
    provider: "razorpay",
    eventId: "evt_rzp_1",
    eventType: "payment.captured",
    orgId: org.id,
    rawBody: body,
    signatureHeader: sig,
    secret,
  });
  assert.equal(ok.accepted, true);
  assert.equal(ok.subscription?.status, "active");
});

test("entitlement gates block missing features and allow entitled ones", async () => {
  const { owner, org, billing } = await setup();
  const sub = billing.ensureTrialSubscription(org.id);
  assert.equal(sub.features.analytics, true);
  assert.equal(sub.features.white_label, false);

  const analytics = await billing.assertEntitled(owner, org.id, "analytics");
  assert.equal(analytics.allowed, true);

  const wl = await billing.assertEntitled(owner, org.id, "white_label");
  assert.equal(wl.allowed, false);

  assert.throws(() => billing.requireFeature(org.id, "white_label"), /not entitled/i);

  await billing.platformSetSubscription(owner, org.id, {
    planCode: "growth_monthly",
    status: "active",
  });
  assert.doesNotThrow(() => billing.requireFeature(org.id, "white_label"));
});

test("checkout without stripe credentials stays pending_configuration", async () => {
  const { owner, org, billing } = await setup();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const result = await billing.startCheckout(owner, org.id, {
    planCode: "starter_monthly",
    provider: "stripe",
  });
  assert.equal(result.status, "pending_configuration");
  assert.equal(result.checkoutUrl, null);
  assert.equal(result.invoice?.status, "pending_configuration");
  const sub = await billing.getSubscription(owner, org.id);
  assert.notEqual(sub.status, "active");
});

test("failed payment moves subscription to past_due with grace", async () => {
  const { org, billing } = await setup();
  billing.ensureTrialSubscription(org.id);
  const secret = "whsec_fail";
  const body = JSON.stringify({ id: "evt_fail_1", type: "invoice.payment_failed" });
  const sig = signStripeWebhook(body, secret);
  const res = billing.processWebhookForTests({
    provider: "stripe",
    eventId: "evt_fail_1",
    eventType: "invoice.payment_failed",
    orgId: org.id,
    rawBody: body,
    signatureHeader: sig,
    secret,
  });
  assert.equal(res.subscription?.status, "past_due");
  assert.ok(res.subscription?.graceEndsAt);
});

test("checkout with stripe keys but no price stays scaffolded; never activates", async () => {
  const { owner, org, billing } = await setup();
  process.env.STRIPE_SECRET_KEY = "sk_test_wave5";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_wave5";
  delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
  try {
    const result = await billing.startCheckout(owner, org.id, {
      planCode: "starter_monthly",
      provider: "stripe",
    });
    assert.equal(result.status, "session_scaffolded");
    assert.equal(result.checkoutUrl, null);
    const sub = await billing.getSubscription(owner, org.id);
    assert.notEqual(sub.status, "active");
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

test("consumeQuota and consumeAiCredits enforce entitlements", async () => {
  const { owner, org, billing, tenancy } = await setup();
  billing.ensureTrialSubscription(org.id);
  billing.consumeQuota(org.id, "messages_sent", 1);
  const sub = await billing.getSubscription(owner, org.id);
  assert.equal(sub.usageQuotas.messages_sent.used, 1);

  billing.consumeAiCredits(org.id, 1);
  const after = await billing.getSubscription(owner, org.id);
  assert.equal(after.aiCreditsUsed, 1);
  assert.equal(after.usageQuotas.ai_jobs.used, 1);

  const mirrored = await tenancy.listQuotas(owner, org.id);
  const aiJobs = mirrored.find((q) => q.metric === "ai_jobs");
  assert.ok(aiJobs);
  assert.equal(aiJobs!.usedValue, 1);

  // Exhaust messages
  const limit = after.usageQuotas.messages_sent.limit;
  const used = after.usageQuotas.messages_sent.used;
  billing.consumeQuota(org.id, "messages_sent", limit - used);
  assert.throws(
    () => billing.consumeQuota(org.id, "messages_sent", 1),
    /Quota exceeded/i,
  );
});

test("client success path cannot activate — only verified webhook", async () => {
  const { owner, org, billing } = await setup();
  await billing.startCheckout(owner, org.id, {
    planCode: "starter_monthly",
    provider: "manual",
  });
  let sub = await billing.getSubscription(owner, org.id);
  assert.notEqual(sub.status, "active");
  // Simulate what a dishonest client callback must NOT do — store stays incomplete
  // until webhook. Manual provider still never auto-activates from startCheckout.
  assert.ok(sub.status === "incomplete" || sub.status === "trialing");
});
