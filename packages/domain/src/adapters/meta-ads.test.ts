import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertMetaLaunchApproved,
  buildMetaLaunchPlan,
  metaAdsCredentialStatus,
  metaAdsCredentialsPresent,
  publishMetaLaunchPlan,
} from "./meta-ads";

describe("meta-ads AI launch adapter", () => {
  it("builds a lead_gen plan from essentials", () => {
    const plan = buildMetaLaunchPlan(
      {
        businessOrOffer: "Condo leads in Whitefield",
        geo: "Bangalore",
        budgetAmount: 25,
        budgetType: "daily",
        currency: "USD",
        objective: "lead_gen",
        audienceBasics: "Home buyers 28-45",
        creativeText: "Find your next home in Whitefield.",
      },
      { id: "plan-1", now: "2026-10-22T00:00:00.000Z" },
    );
    assert.equal(plan.network, "meta");
    assert.equal(plan.objective, "OUTCOME_LEADS");
    assert.equal(plan.geo, "Bangalore");
    assert.equal(plan.budgetAmount, 25);
    assert.match(plan.primaryText, /Whitefield|Condo/i);
    assert.equal(plan.enableSpend, false);
  });

  it("reports pending_configuration without tokens", () => {
    const status = metaAdsCredentialStatus({});
    assert.equal(status.status, "pending_configuration");
    assert.equal(metaAdsCredentialsPresent({}), false);
  });

  it("approval gate rejects unapproved publish", () => {
    assert.throws(() => assertMetaLaunchApproved(false), /approval/i);
    assert.doesNotThrow(() => assertMetaLaunchApproved(true));
  });

  it("approve without credentials returns pending_configuration — never live", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "Solar kits",
      geo: "Mumbai",
      budgetAmount: 40,
      budgetType: "daily",
      currency: "INR",
      objective: "lead_gen",
    });
    assertMetaLaunchApproved(true);
    const result = await publishMetaLaunchPlan(plan, {});
    assert.equal(result.status, "pending_configuration");
    assert.match(result.detail, /draft|credentials|META_ADS/i);
    assert.ok(result.setupHints.length >= 3);
    assert.equal(result.external, undefined);
  });

  it("with credentials calls Graph API and can create paused campaign", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "Demo offer",
      geo: "Bangalore",
      budgetAmount: 15,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/p/demo",
      enableSpend: false,
    });
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
      if (url.includes("/campaigns") || url.includes("/adsets") || url.includes("/ads")) {
        assert.equal(body.status, "PAUSED");
      }
      if (url.includes("/campaigns")) {
        return new Response(JSON.stringify({ id: "camp_1" }), { status: 200 });
      }
      if (url.includes("/adsets")) {
        return new Response(JSON.stringify({ id: "adset_1" }), { status: 200 });
      }
      if (url.includes("/adcreatives")) {
        return new Response(JSON.stringify({ id: "cr_1" }), { status: 200 });
      }
      if (url.includes("/ads")) {
        return new Response(JSON.stringify({ id: "ad_1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected" } }), {
        status: 400,
      });
    };
    const result = await publishMetaLaunchPlan(
      plan,
      {
        META_ADS_ACCESS_TOKEN: "token",
        META_ADS_AD_ACCOUNT_ID: "123",
        META_ADS_APP_ID: "app",
        META_ADS_PAGE_ID: "page",
      },
      { fetchImpl },
    );
    assert.equal(result.status, "created_paused");
    assert.equal(result.external?.campaignId, "camp_1");
    assert.equal(result.external?.adSetId, "adset_1");
    assert.ok(calls.some((u) => u.includes("/campaigns")));
  });
});
