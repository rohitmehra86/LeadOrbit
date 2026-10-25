import assert from "node:assert/strict";
import test from "node:test";
import {
  signRazorpayWebhook,
  signStripeWebhook,
} from "@leadorbit/domain/server";
import { getAuthMode } from "@leadorbit/db";
import { getBillingStore, isSupabaseBillingStore } from "./billing";
import {
  getSupabaseBillingStore,
  resetSupabaseBillingStoreForTests,
  setSupabaseBillingAdminClientForTests,
  SupabaseBillingStore,
} from "./supabase-billing";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEMO_ORG = "33333333-3333-4333-8333-333333333333";

test("supabase mode selects SupabaseBillingStore and not SQLite", () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  try {
    resetSupabaseBillingStoreForTests();
    assert.equal(getAuthMode(), "supabase");
    const store = getBillingStore();
    assert.equal(isSupabaseBillingStore(store), true);
    assert.ok(store instanceof SupabaseBillingStore);
    assert.equal(getSupabaseBillingStore(), store);
  } finally {
    if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prev.AUTH_MODE;
    if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
    if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
    resetSupabaseBillingStoreForTests();
  }
});

test("local mode keeps SQLite BillingStore (no silent supabase)", () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  process.env.AUTH_MODE = "local";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    assert.equal(getAuthMode(), "local");
    const store = getBillingStore();
    assert.equal(isSupabaseBillingStore(store), false);
    assert.equal(store.constructor.name, "BillingStore");
  } finally {
    if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prev.AUTH_MODE;
    if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
    if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  }
});

test("supabase store rejects invalid Stripe signature without calling RPC", async () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  resetSupabaseBillingStoreForTests();
  const store = getSupabaseBillingStore();
  const body = JSON.stringify({
    id: "evt_bad_sig",
    type: "invoice.paid",
    data: { object: { metadata: { orgId: DEMO_ORG } } },
  });
  const result = await store.processVerifiedWebhook({
    provider: "stripe",
    eventId: "evt_bad_sig",
    eventType: "invoice.paid",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: "t=1,v1=deadbeef",
  });
  assert.equal(result.accepted, false);
  assert.match(result.detail, /Invalid Stripe signature|Timestamp|Malformed/i);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = prev.SECRET;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetSupabaseBillingStoreForTests();
});

test("supabase store rejects invalid Razorpay signature", async () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  resetSupabaseBillingStoreForTests();
  const store = getSupabaseBillingStore();
  const body = JSON.stringify({ event: "payment.captured", id: "evt_rzp_bad" });
  const result = await store.processVerifiedWebhook({
    provider: "razorpay",
    eventId: "evt_rzp_bad",
    eventType: "payment.captured",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: "00".repeat(32),
  });
  assert.equal(result.accepted, false);
  assert.match(result.detail, /Invalid Razorpay signature/i);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SECRET === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  else process.env.RAZORPAY_WEBHOOK_SECRET = prev.SECRET;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetSupabaseBillingStoreForTests();
});

test("supabase store refuses webhook when service role is missing after valid signature", async () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_ok";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSupabaseBillingStoreForTests();
  const store = getSupabaseBillingStore();
  const body = JSON.stringify({
    id: "evt_no_admin",
    type: "invoice.paid",
    data: { object: { id: "cs_1", metadata: { orgId: DEMO_ORG } } },
  });
  const sig = signStripeWebhook(body, "whsec_ok");
  const result = await store.processVerifiedWebhook({
    provider: "stripe",
    eventId: "evt_no_admin",
    eventType: "invoice.paid",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: sig,
  });
  assert.equal(result.accepted, false);
  assert.match(result.detail, /SERVICE_ROLE|admin client/i);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = prev.SECRET;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetSupabaseBillingStoreForTests();
});

test("valid Stripe and Razorpay signatures are produced for fixture bodies", () => {
  const stripeBody = JSON.stringify({ id: "evt_ok", type: "invoice.paid" });
  const stripeSecret = "whsec_fixture";
  const stripeSig = signStripeWebhook(stripeBody, stripeSecret);
  assert.match(stripeSig, /^t=\d+,v1=[a-f0-9]+$/);

  const rzBody = JSON.stringify({ event: "payment.captured", id: "evt_rzp_ok" });
  const rzSig = signRazorpayWebhook(rzBody, "rzp_fixture");
  assert.equal(rzSig.length, 64);
});

function fakeAdmin(rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => rpcImpl(fn, args),
  } as unknown as SupabaseClient;
}

test("valid Stripe webhook with mocked RPC activates once; duplicate is idempotent", async () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_rpc";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  resetSupabaseBillingStoreForTests();

  let calls = 0;
  setSupabaseBillingAdminClientForTests(
    fakeAdmin(async (fn, args) => {
      assert.equal(fn, "apply_billing_webhook");
      assert.equal(args.p_event_id, "evt_rpc_1");
      assert.equal(args.p_claimed_org_id, DEMO_ORG);
      assert.equal(args.p_provider_ref, "cs_test_rpc");
      calls += 1;
      return {
        data: {
          accepted: true,
          duplicate: calls > 1,
          detail: calls > 1 ? "Webhook already processed (idempotent)" : "activated",
          subscription: {
            id: "sub_1",
            orgId: DEMO_ORG,
            planCode: "starter_monthly",
            status: "active",
            interval: "monthly",
            seatsIncluded: 5,
            seatsUsed: 1,
            aiCreditsIncluded: 2000,
            aiCreditsUsed: 0,
            usageQuotas: {},
            features: { analytics: true },
            trialEndsAt: null,
            currentPeriodStart: new Date().toISOString(),
            currentPeriodEnd: new Date().toISOString(),
            cancelAtPeriodEnd: false,
            graceEndsAt: null,
            provider: "stripe",
            providerCustomerId: null,
            providerSubscriptionId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        error: null,
      };
    }),
  );

  const store = getSupabaseBillingStore();
  const body = JSON.stringify({
    id: "evt_rpc_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_rpc",
        metadata: { orgId: DEMO_ORG },
      },
    },
  });
  const sig = signStripeWebhook(body, "whsec_rpc");
  const first = await store.processVerifiedWebhook({
    provider: "stripe",
    eventId: "evt_rpc_1",
    eventType: "checkout.session.completed",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: sig,
  });
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.subscription?.status, "active");

  const second = await store.processVerifiedWebhook({
    provider: "stripe",
    eventId: "evt_rpc_1",
    eventType: "checkout.session.completed",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: sig,
  });
  assert.equal(second.accepted, true);
  assert.equal(second.duplicate, true);
  assert.equal(calls, 2);

  setSupabaseBillingAdminClientForTests(null);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = prev.SECRET;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetSupabaseBillingStoreForTests();
});

test("RPC failure is not accepted (retryable) and wrong-org detail is preserved", async () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fail";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  resetSupabaseBillingStoreForTests();

  setSupabaseBillingAdminClientForTests(
    fakeAdmin(async () => ({
      data: null,
      error: { message: "connection reset by peer" },
    })),
  );
  const store = getSupabaseBillingStore();
  const body = JSON.stringify({
    id: "evt_tx_fail",
    type: "invoice.paid",
    data: { object: { id: "cs_x", metadata: { orgId: DEMO_ORG } } },
  });
  const sig = signStripeWebhook(body, "whsec_fail");
  const failed = await store.processVerifiedWebhook({
    provider: "stripe",
    eventId: "evt_tx_fail",
    eventType: "invoice.paid",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: sig,
  });
  assert.equal(failed.accepted, false);
  assert.match(failed.detail, /connection reset/i);

  setSupabaseBillingAdminClientForTests(
    fakeAdmin(async () => ({
      data: {
        accepted: true,
        duplicate: false,
        detail: "claimed orgId has no matching checkout or in-flight subscription",
        orgId: null,
        subscription: null,
      },
      error: null,
    })),
  );
  const body2 = JSON.stringify({
    id: "evt_wrong_org",
    type: "invoice.paid",
    data: {
      object: {
        id: "cs_unknown",
        metadata: { orgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      },
    },
  });
  const sig2 = signStripeWebhook(body2, "whsec_fail");
  const wrong = await store.processVerifiedWebhook({
    provider: "stripe",
    eventId: "evt_wrong_org",
    eventType: "invoice.paid",
    orgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    rawBody: body2,
    signatureHeader: sig2,
  });
  assert.equal(wrong.accepted, true);
  assert.equal(wrong.subscription, null);
  assert.match(wrong.detail, /no matching checkout/i);

  setSupabaseBillingAdminClientForTests(null);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = prev.SECRET;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetSupabaseBillingStoreForTests();
});

test("valid Razorpay webhook with mocked RPC activates", async () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_rpc";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  resetSupabaseBillingStoreForTests();
  setSupabaseBillingAdminClientForTests(
    fakeAdmin(async () => ({
      data: {
        accepted: true,
        duplicate: false,
        detail: "activated",
        subscription: {
          id: "sub_rz",
          orgId: DEMO_ORG,
          planCode: "starter_monthly",
          status: "active",
          interval: "monthly",
          seatsIncluded: 5,
          seatsUsed: 1,
          aiCreditsIncluded: 2000,
          aiCreditsUsed: 0,
          usageQuotas: {},
          features: {},
          trialEndsAt: null,
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date().toISOString(),
          cancelAtPeriodEnd: false,
          graceEndsAt: null,
          provider: "razorpay",
          providerCustomerId: null,
          providerSubscriptionId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      error: null,
    })),
  );
  const store = getSupabaseBillingStore();
  const body = JSON.stringify({
    event: "payment.captured",
    id: "evt_rzp_ok",
    payload: {
      payment: { entity: { id: "pay_1", notes: { orgId: DEMO_ORG } } },
    },
  });
  const sig = signRazorpayWebhook(body, "rzp_rpc");
  const ok = await store.processVerifiedWebhook({
    provider: "razorpay",
    eventId: "evt_rzp_ok",
    eventType: "payment.captured",
    orgId: DEMO_ORG,
    rawBody: body,
    signatureHeader: sig,
  });
  assert.equal(ok.accepted, true);
  assert.equal(ok.subscription?.status, "active");
  setSupabaseBillingAdminClientForTests(null);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SECRET === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  else process.env.RAZORPAY_WEBHOOK_SECRET = prev.SECRET;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetSupabaseBillingStoreForTests();
});
