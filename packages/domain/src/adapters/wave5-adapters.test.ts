import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  applyQuotaIncrement,
  canConsumeAiCredits,
  canConsumeQuota,
  createRazorpayCheckoutSession,
  createStripeCheckoutSession,
  defaultTrialUsageQuotas,
  resolveOrgIdFromHostMap,
  stripePriceIdForPlan,
  verifyDomainTxtChallenge,
} from "./index";

const prev = { ...process.env };

before(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

after(() => {
  process.env = { ...prev };
});

test("stripe checkout pending without credentials — no fake URL", async () => {
  const res = await createStripeCheckoutSession({
    orgId: "org_1",
    planCode: "starter_monthly",
  });
  assert.equal(res.status, "pending_configuration");
  assert.equal(res.checkoutUrl, null);
  assert.ok(res.setupHints.length >= 1);
});

test("stripe checkout scaffolded when keys present but no price id", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
  const res = await createStripeCheckoutSession({
    orgId: "org_1",
    planCode: "starter_monthly",
  });
  assert.equal(res.status, "session_scaffolded");
  assert.equal(res.checkoutUrl, null);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

test("stripe checkout creates session via injected fetch", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_123";
  const res = await createStripeCheckoutSession({
    orgId: "org_live",
    planCode: "starter_monthly",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/c/pay/cs_test_1",
        }),
        { status: 200 },
      ),
  });
  assert.equal(res.status, "session_created");
  assert.equal(res.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_1");
  assert.match(res.detail, /webhook/i);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
});

test("razorpay pending without credentials", async () => {
  const res = await createRazorpayCheckoutSession({
    orgId: "org_1",
    planCode: "starter_monthly",
    amountCents: 4900,
    currency: "INR",
  });
  assert.equal(res.status, "pending_configuration");
  assert.equal(res.checkoutUrl, null);
});

test("razorpay payment link via injected fetch", async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
  const res = await createRazorpayCheckoutSession({
    orgId: "org_rzp",
    planCode: "starter_monthly",
    amountCents: 4900,
    currency: "INR",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          id: "plink_1",
          short_url: "https://rzp.io/i/abc",
        }),
        { status: 200 },
      ),
  });
  assert.equal(res.status, "session_created");
  assert.equal(res.checkoutUrl, "https://rzp.io/i/abc");
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

test("metering helpers enforce quotas and credits", () => {
  const q = defaultTrialUsageQuotas();
  assert.equal(canConsumeQuota(q.ai_jobs, 1).ok, true);
  const next = applyQuotaIncrement(q.ai_jobs, 100);
  assert.equal(canConsumeQuota(next, 1).ok, false);
  assert.equal(
    canConsumeAiCredits({ included: 10, used: 10, credits: 1 }).ok,
    false,
  );
  assert.equal(stripePriceIdForPlan("unknown"), null);
});

test("dns verify never marks verified without TXT match", async () => {
  const pending = await verifyDomainTxtChallenge({
    hostname: "crm.example.com",
    expectedToken: "leadorbit-verify=abc",
    lookup: async () => [],
  });
  assert.equal(pending.status, "pending");

  const verified = await verifyDomainTxtChallenge({
    hostname: "crm.example.com",
    expectedToken: "leadorbit-verify=abc",
    lookup: async () => ["leadorbit-verify=abc"],
  });
  assert.equal(verified.status, "verified");

  const failed = await verifyDomainTxtChallenge({
    hostname: "crm.example.com",
    expectedToken: "leadorbit-verify=abc",
    lookup: async () => ["other=1"],
  });
  assert.equal(failed.status, "failed");

  assert.equal(
    resolveOrgIdFromHostMap("crm.example.com", { "crm.example.com": "org_x" }),
    "org_x",
  );
});
