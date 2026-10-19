import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptCheckoutSession,
  authorizeBillingProvider,
  featureAllowed,
  quotaExceeded,
} from "./billing";
import {
  signRazorpayWebhook,
  signStripeWebhook,
  verifyRazorpayWebhook,
  verifyStripeWebhook,
} from "./server";

test("stripe without credentials is pending", () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    assert.equal(authorizeBillingProvider("stripe").status, "pending_configuration");
    const checkout = attemptCheckoutSession({
      provider: "stripe",
      planCode: "starter_monthly",
    });
    assert.equal(checkout.status, "pending_configuration");
    assert.equal(checkout.checkoutUrl, null);
  } finally {
    if (prev) process.env.STRIPE_SECRET_KEY = prev;
  }
});

test("stripe webhook signature roundtrip", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const secret = "whsec_test";
  const sig = signStripeWebhook(body, secret);
  assert.equal(verifyStripeWebhook({ rawBody: body, signatureHeader: sig, secret }).ok, true);
  assert.equal(
    verifyStripeWebhook({
      rawBody: body,
      signatureHeader: sig,
      secret: "wrong",
    }).ok,
    false,
  );
});

test("razorpay webhook signature roundtrip", () => {
  const body = '{"event":"payment.captured"}';
  const secret = "rzp_whsec";
  const sig = signRazorpayWebhook(body, secret);
  assert.equal(
    verifyRazorpayWebhook({ rawBody: body, signatureHeader: sig, secret }).ok,
    true,
  );
});

test("entitlement helpers", () => {
  assert.equal(featureAllowed({ ai: true }, "ai"), true);
  assert.equal(featureAllowed({ ai: false }, "ai"), false);
  assert.equal(quotaExceeded(10, 10), true);
  assert.equal(quotaExceeded(9, 10), false);
  assert.equal(quotaExceeded(100, -1), false);
});
