import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceDeliveryStatus,
  ingestionFingerprint,
  leadAdsSyncStub,
  matchCampaignByUtm,
  normalizeIdempotencyKey,
  resolveAttribution,
  signWebhookPayload,
  verifyWebhookSignature,
  type AttributionTouchpoint,
} from "./ingestion";

test("webhook signature validates and rejects tampering", () => {
  const secret = "whsec_test";
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"email":"a@b.co"}';
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
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: body,
      signature: "sha256=deadbeef",
    }).ok,
    false,
  );
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: '{"email":"other"}',
      signature: sig,
    }).ok,
    false,
  );
});

test("webhook signature rejects stale timestamp", () => {
  const secret = "whsec_test";
  const ts = String(Math.floor(Date.now() / 1000) - 3600);
  const body = "{}";
  const sig = signWebhookPayload(secret, ts, body);
  const r = verifyWebhookSignature({
    secret,
    timestamp: ts,
    rawBody: body,
    signature: sig,
    maxSkewSec: 300,
  });
  assert.equal(r.ok, false);
});

test("normalizeIdempotencyKey namespaces by channel", () => {
  assert.equal(normalizeIdempotencyKey("webhook", " abc "), "webhook:abc");
  assert.equal(normalizeIdempotencyKey("form", null), null);
});

test("resolveAttribution first/last/linear", () => {
  const base = {
    orgId: "o",
    leadId: "l",
    opportunityId: null,
    channel: "webhook" as const,
    utm: {},
    meta: {},
  };
  const tps: AttributionTouchpoint[] = [
    {
      ...base,
      id: "1",
      campaignId: "c1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    },
    {
      ...base,
      id: "2",
      campaignId: "c2",
      occurredAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  assert.equal(resolveAttribution("first_touch", tps).campaignId, "c1");
  assert.equal(resolveAttribution("last_touch", tps).campaignId, "c2");
  const linear = resolveAttribution("linear", tps);
  assert.equal(linear.weightByCampaign.c1, 0.5);
  assert.equal(linear.weightByCampaign.c2, 0.5);
});

test("leadAdsSyncStub pending without credentials", () => {
  assert.equal(
    leadAdsSyncStub("meta_lead_ads", false).status,
    "pending_configuration",
  );
});

test("matchCampaignByUtm", () => {
  const id = matchCampaignByUtm(
    [
      {
        id: "camp1",
        utm: {
          utmSource: "meta",
          utmMedium: "cpc",
          utmCampaign: "spring",
        },
      },
    ],
    { utmSource: "meta", utmMedium: "cpc", utmCampaign: "spring" },
  );
  assert.equal(id, "camp1");
});

test("advanceDeliveryStatus retries then dead_letters", () => {
  const a = advanceDeliveryStatus("pending", 0, false);
  assert.equal(a.status, "retrying");
  const b = advanceDeliveryStatus("retrying", 1, false);
  assert.equal(b.status, "retrying");
  const c = advanceDeliveryStatus("retrying", 2, false);
  assert.equal(c.status, "dead_letter");
  const ok = advanceDeliveryStatus("retrying", 1, true);
  assert.equal(ok.status, "delivered");
});

test("ingestionFingerprint prefers external id", () => {
  assert.equal(
    ingestionFingerprint({ externalEventId: "e1", email: "a@b.co" }),
    "ext:e1",
  );
});
