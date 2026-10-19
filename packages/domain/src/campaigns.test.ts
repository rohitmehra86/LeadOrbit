import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adNetworkAuthorizeStub,
  aggregatePerformance,
  aiCopySuggestionHook,
  appendUtmToUrl,
  buildUtmParams,
  sanitizePageDocument,
  submissionFingerprint,
  validateFormPayload,
  leadGenFormTemplate,
  type FormDefinition,
} from "./campaigns";

test("buildUtmParams + appendUtmToUrl", () => {
  const utm = buildUtmParams({
    source: "Meta Ads",
    medium: "cpc",
    campaign: "Spring Launch",
  });
  assert.equal(utm.utmSource, "meta-ads");
  assert.equal(utm.utmCampaign, "spring-launch");
  const url = appendUtmToUrl("/p/demo", utm);
  assert.match(url, /utm_source=meta-ads/);
  assert.match(url, /utm_campaign=spring-launch/);
});

test("sanitizePageDocument drops script blocks and dangerous props", () => {
  const doc = sanitizePageDocument({
    blocks: [
      { id: "1", type: "hero", props: { headline: "Hi", script: "alert(1)" } },
      { id: "2", type: "evil_script", props: { html: "<script>x</script>" } },
      {
        id: "3",
        type: "rich_text",
        props: { body: "Safe <script>bad()</script> text" },
      },
    ],
    seo: { title: "T", description: "D" },
  });
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0]!.props.script, undefined);
  assert.equal(String(doc.blocks[1]!.props.body).includes("<script>"), false);
});

test("validateFormPayload enforces required + honeypot", () => {
  const fields = leadGenFormTemplate();
  const form: FormDefinition = {
    id: "form1",
    orgId: "o1",
    campaignId: null,
    name: "Lead",
    status: "published",
    fields,
    multiStep: true,
    spamHoneypotEnabled: true,
    duplicateDetection: true,
    consentText: null,
    webhookUrl: null,
    embedEnabled: true,
    version: 1,
    templateKey: "lead_gen",
    thankYouMessage: "Thanks",
    createdAt: "",
    updatedAt: "",
  };
  const bad = validateFormPayload(form, { email: "x" }, "bot");
  assert.equal(bad.ok, false);
  const ok = validateFormPayload(
    form,
    {
      fullName: "A",
      email: "a@b.co",
      consent: true,
      budget: "Under $500k",
    },
    "",
  );
  assert.equal(ok.ok, true);
});

test("aiCopySuggestionHook marks unverified without key", () => {
  const r = aiCopySuggestionHook({ prompt: "Write ad copy", llmApiKey: null });
  assert.equal(r.status, "unverified");
  assert.equal(r.suggestions.length, 0);
});

test("adNetworkAuthorizeStub pending without credentials", () => {
  const r = adNetworkAuthorizeStub("meta", false);
  assert.equal(r.status, "pending_configuration");
});

test("aggregatePerformance from real event types", () => {
  const p = aggregatePerformance([
    { eventType: "page_view" },
    { eventType: "page_view" },
    { eventType: "form_submit" },
    { eventType: "conversion" },
  ]);
  assert.equal(p.pageViews, 2);
  assert.equal(p.formSubmits, 1);
  assert.equal(p.conversions, 1);
});

test("submissionFingerprint stable for email/phone", () => {
  const a = submissionFingerprint("f", { email: "A@B.co", phone: "(555) 111" });
  const b = submissionFingerprint("f", { email: "a@b.co", phone: "555111" });
  assert.equal(a, b);
});
