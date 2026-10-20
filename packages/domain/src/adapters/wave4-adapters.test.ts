import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  authorizeLeadAdsNetwork,
  normalizeMetaLeadAd,
  normalizeGoogleLeadAd,
  pullLeadAdsFromNetwork,
  deliverOutboundMessage,
  verifyWhatsAppWebhookChallenge,
  buildCalendarOAuthStartUrl,
  syncAppointmentToExternalCalendar,
  deriveAdSpendSnapshot,
  formatAdSpendForResults,
} from "./index";

const prev = { ...process.env };

before(() => {
  delete process.env.META_ADS_ACCESS_TOKEN;
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_URL;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

after(() => {
  process.env = { ...prev };
});

test("lead ads authorize pending without credentials", () => {
  const a = authorizeLeadAdsNetwork("meta_lead_ads");
  assert.equal(a.status, "pending_configuration");
  assert.ok(a.setupHints.length >= 1);
});

test("lead ads pull never invents live leads", () => {
  process.env.META_ADS_ACCESS_TOKEN = "tok";
  const pulled = pullLeadAdsFromNetwork({ network: "meta_lead_ads" });
  assert.equal(pulled.imported, 0);
  assert.notEqual(pulled.status, "imported");
  delete process.env.META_ADS_ACCESS_TOKEN;
});

test("normalize Meta / Google lead fixtures", () => {
  const meta = normalizeMetaLeadAd({
    id: "lg1",
    field_data: [
      { name: "full_name", values: ["Riya Shah"] },
      { name: "email", values: ["riya@example.com"] },
    ],
  });
  assert.equal(meta?.fullName, "Riya Shah");
  assert.equal(meta?.email, "riya@example.com");

  const google = normalizeGoogleLeadAd({
    lead_id: "g1",
    user_column_data: [
      { column_id: "FULL_NAME", string_value: "Dev Patel" },
      { column_id: "EMAIL", string_value: "dev@example.com" },
    ],
  });
  assert.equal(google?.fullName, "Dev Patel");
});

test("fixture pull imports without claiming live Ads", () => {
  process.env.META_ADS_ACCESS_TOKEN = "tok";
  const pulled = pullLeadAdsFromNetwork({
    network: "meta_lead_ads",
    fixtureLeads: [
      {
        id: "fx1",
        field_data: [{ name: "full_name", values: ["Fixture Lead"] }],
      },
    ],
  });
  assert.equal(pulled.status, "imported");
  assert.equal(pulled.imported, 1);
  assert.match(pulled.detail, /not a live/i);
  delete process.env.META_ADS_ACCESS_TOKEN;
});

test("messaging delivery blocked without credentials", () => {
  const r = deliverOutboundMessage({
    channel: "whatsapp",
    to: "+15551212",
    body: "hi",
  });
  assert.equal(r.deliveryStatus, "pending_configuration");
  assert.ok(r.setupHints.length >= 1);
});

test("WhatsApp webhook challenge verify", () => {
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
  const bad = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "wrong",
    challenge: "123",
  });
  assert.equal(bad.ok, false);
  const ok = verifyWhatsAppWebhookChallenge({
    mode: "subscribe",
    verifyToken: "verify-me",
    challenge: "123",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.challenge, "123");
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

test("calendar OAuth start blocked without client secrets", () => {
  const start = buildCalendarOAuthStartUrl("google", {
    orgId: "org1",
    state: "abc",
  });
  assert.equal(start.status, "pending_configuration");
  assert.equal(start.url, null);

  const sync = syncAppointmentToExternalCalendar({
    provider: "google",
    appointmentId: "a1",
    title: "Meet",
    startsAt: new Date().toISOString(),
    endsAt: new Date().toISOString(),
  });
  assert.equal(sync.status, "pending_configuration");
  assert.equal(sync.externalEventId, null);
});

test("ad spend unavailable vs zero vs reported", () => {
  const unavailable = deriveAdSpendSnapshot({ network: "meta", events: [] });
  assert.equal(unavailable.availability, "unavailable");
  assert.equal(formatAdSpendForResults(unavailable).value, "Unavailable");

  const zero = deriveAdSpendSnapshot({
    network: "meta",
    events: [{ eventType: "ad_spend", meta: { spendCents: 0, currency: "USD" } }],
  });
  assert.equal(zero.availability, "zero");
  assert.equal(formatAdSpendForResults(zero).value, "0");

  const reported = deriveAdSpendSnapshot({
    network: "google_ads",
    events: [
      { eventType: "ad_spend", meta: { spendCents: 2500, currency: "INR" } },
    ],
  });
  assert.equal(reported.availability, "reported");
  assert.match(formatAdSpendForResults(reported).value, /25\.00/);
});
