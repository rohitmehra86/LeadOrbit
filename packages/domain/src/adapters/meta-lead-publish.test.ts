import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMetaLaunchPlan } from "./meta-ads";
import {
  buildMetaLeadAdSetBody,
  validateMetaLeadPublishConfig,
} from "./meta-lead-publish";

const basePlan = () =>
  buildMetaLaunchPlan(
    {
      businessOrOffer: "Condo leads",
      geo: "Bangalore",
      budgetAmount: 20,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://leadorbit-delta.vercel.app/p/demo",
    },
    { id: "p1", now: "2026-10-24T00:00:00.000Z" },
  );

describe("meta-lead-publish", () => {
  it("blocks website leads when META_ADS_PIXEL_ID is missing", () => {
    const v = validateMetaLeadPublishConfig(basePlan(), {
      pageId: "1334971606375689",
      pixelId: null,
    });
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.match(v.detail, /META_ADS_PIXEL_ID/i);
    }
  });

  it("builds ad set with promoted_object for website OUTCOME_LEADS", () => {
    const v = validateMetaLeadPublishConfig(basePlan(), {
      pageId: "1334971606375689",
      pixelId: "987654321",
    });
    assert.equal(v.ok, true);
    if (!v.ok) return;

    const body = buildMetaLeadAdSetBody({
      name: "Test — Bangalore",
      campaignId: "120249589612440250",
      countryCode: "IN",
      status: "PAUSED",
      dailyBudgetMinor: 2000,
      destination: v.destination,
      pageId: "1334971606375689",
      pixelId: "987654321",
    });

    assert.equal(body.destination_type, "WEBSITE");
    assert.equal(body.optimization_goal, "LEAD_GENERATION");
    const promoted = body.promoted_object as Record<string, string>;
    assert.equal(promoted.page_id, "1334971606375689");
    assert.equal(promoted.pixel_id, "987654321");
    assert.equal(promoted.custom_event_type, "LEAD");
  });

  it("builds ON_AD ad set for instant form destination", () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "Form leads",
      geo: "Mumbai",
      budgetAmount: 10,
      budgetType: "daily",
      currency: "INR",
      objective: "lead_gen",
      leadGenFormId: "123456789",
    });
    const v = validateMetaLeadPublishConfig(plan, {
      pageId: "page1",
      leadGenFormId: "123456789",
    });
    assert.equal(v.ok, true);
    if (!v.ok) return;

    const body = buildMetaLeadAdSetBody({
      name: "Form set",
      campaignId: "c1",
      countryCode: "IN",
      status: "PAUSED",
      dailyBudgetMinor: 1000,
      destination: "instant_form",
      pageId: "page1",
    });
    assert.equal(body.destination_type, "ON_AD");
    const promoted = body.promoted_object as Record<string, string>;
    assert.equal(promoted.page_id, "page1");
    assert.equal(promoted.pixel_id, undefined);
  });

  it("blocks instant form when form id missing", () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "Form leads",
      geo: "Mumbai",
      budgetAmount: 10,
      budgetType: "daily",
      currency: "INR",
      objective: "lead_gen",
      landingPageUrl: null as unknown as string,
    });
    plan.landingPageUrl = null;
    const v = validateMetaLeadPublishConfig(plan, { pageId: "page1" });
    assert.equal(v.ok, false);
  });
});
