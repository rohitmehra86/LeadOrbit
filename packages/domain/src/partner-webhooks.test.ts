import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PARTNER_EVENT_CATALOG,
  applyOutboundDeliveryAttempt,
  buildOutboundWebhookEnvelope,
  normalizeEventTypes,
  postSignedOutboundWebhook,
  validateOutboundTargetUrl,
} from "./partner-webhooks";
import { signWebhookPayload, verifyWebhookSignature } from "./server";

test("partner event catalog includes lead.created and partner.test", () => {
  const types = PARTNER_EVENT_CATALOG.map((e) => e.type);
  assert.ok(types.includes("lead.created"));
  assert.ok(types.includes("partner.test"));
});

test("validateOutboundTargetUrl requires https except localhost", () => {
  assert.equal(validateOutboundTargetUrl("https://hooks.zapier.com/x").ok, true);
  assert.equal(
    validateOutboundTargetUrl("http://127.0.0.1:5678/webhook").ok,
    true,
  );
  assert.equal(validateOutboundTargetUrl("http://evil.example/hook").ok, false);
  assert.equal(validateOutboundTargetUrl("not-a-url").ok, false);
});

test("outbound envelope + signature roundtrip", () => {
  const envelope = buildOutboundWebhookEnvelope({
    orgId: "org_1",
    eventType: "partner.test",
    eventId: "evt_1",
    data: { ping: true },
  });
  const body = JSON.stringify(envelope);
  const ts = String(Math.floor(Date.now() / 1000));
  const secret = "pwhsec_test";
  const sig = signWebhookPayload(secret, ts, body);
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: body,
      signature: sig,
    }).ok,
    true,
  );
});

test("delivery attempts retry then dead_letter; success delivers", () => {
  const a = applyOutboundDeliveryAttempt(0, false);
  assert.equal(a.status, "retrying");
  assert.ok(a.retryDelayMs && a.retryDelayMs > 0);
  const b = applyOutboundDeliveryAttempt(1, false);
  assert.equal(b.status, "retrying");
  const c = applyOutboundDeliveryAttempt(2, false);
  assert.equal(c.status, "dead_letter");
  const ok = applyOutboundDeliveryAttempt(0, true);
  assert.equal(ok.status, "delivered");
});

test("postSignedOutboundWebhook never fakes success on non-2xx", async () => {
  const fail = await postSignedOutboundWebhook({
    targetUrl: "https://example.test/hook",
    rawBody: "{}",
    signature: "sha256=abc",
    timestamp: "1",
    fetchImpl: async () => new Response("nope", { status: 500 }),
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.statusCode, 500);

  const ok = await postSignedOutboundWebhook({
    targetUrl: "https://example.test/hook",
    rawBody: "{}",
    signature: "sha256=abc",
    timestamp: "1",
    fetchImpl: async () => new Response("ok", { status: 200 }),
  });
  assert.equal(ok.ok, true);
});

test("normalizeEventTypes defaults and filters unknown", () => {
  assert.deepEqual(normalizeEventTypes(["lead.created", "nope"]), [
    "lead.created",
  ]);
  assert.ok(normalizeEventTypes([]).includes("partner.test"));
});
