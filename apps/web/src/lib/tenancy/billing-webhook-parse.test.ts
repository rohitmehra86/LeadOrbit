import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBillingWebhookHints,
  parseRazorpayWebhookHints,
  parseStripeWebhookHints,
} from "./billing-webhook-parse";

test("stripe hints prefer metadata orgId and session id", () => {
  const body = JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc",
        client_reference_id: "33333333-3333-4333-8333-333333333333",
        metadata: { orgId: "33333333-3333-4333-8333-333333333333", planCode: "starter_monthly" },
      },
    },
  });
  const hints = parseStripeWebhookHints(body);
  assert.equal(hints.claimedOrgId, "33333333-3333-4333-8333-333333333333");
  assert.equal(hints.providerRef, "cs_test_abc");
});

test("razorpay hints read notes.orgId and payment id", () => {
  const body = JSON.stringify({
    event: "payment.captured",
    id: "evt_rzp",
    payload: {
      payment: {
        entity: {
          id: "pay_123",
          notes: { orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        },
      },
    },
  });
  const hints = parseRazorpayWebhookHints(body);
  assert.equal(hints.claimedOrgId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(hints.providerRef, "pay_123");
});

test("malformed bodies yield null hints", () => {
  assert.deepEqual(parseBillingWebhookHints("stripe", "not-json"), {
    claimedOrgId: null,
    providerRef: null,
  });
});
