import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertMetaLaunchApproved,
  buildMetaLaunchPlan,
  metaAdsCredentialStatus,
  metaAdsCredentialsPresent,
  metaAdsReadyForCreate,
  inferMetaResumeAfterPartialFailure,
  parseMetaIdsFromAdCopy,
  publishMetaLaunchPlan,
} from "./meta-ads";

const FULL_ENV = {
  META_ADS_APP_ID: "app",
  META_ADS_APP_SECRET: "secret",
  META_ADS_ALLOW_ENV_FALLBACK: "true",
  META_ADS_ACCESS_TOKEN: "token",
  META_ADS_AD_ACCOUNT_ID: "123",
  META_ADS_PAGE_ID: "page",
  META_ADS_PIXEL_ID: "pixel_123",
};

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
    assert.equal(metaAdsReadyForCreate({}), false);
  });

  it("partial creds are not ready for create", () => {
    const status = metaAdsCredentialStatus({
      META_ADS_ACCESS_TOKEN: "tok",
      META_ADS_AD_ACCOUNT_ID: "act_1",
    });
    assert.equal(status.status, "partial");
    assert.equal(metaAdsReadyForCreate({
      META_ADS_ACCESS_TOKEN: "tok",
      META_ADS_AD_ACCOUNT_ID: "act_1",
    }), false);
  });

  it("ready only when all five META_ADS_* present", () => {
    assert.equal(metaAdsCredentialStatus(FULL_ENV).status, "ready");
    assert.equal(metaAdsReadyForCreate(FULL_ENV), true);
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
    assert.equal(result.metaCreated, false);
    assert.equal(result.campaign_id, null);
    assert.equal(result.adset_id, null);
    assert.equal(result.ad_id, null);
    assert.match(result.detail, /blocked|credentials|META_ADS/i);
    assert.ok(result.setupHints.length >= 3);
  });

  it("partial credentials do not call Graph API", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-PARTIAL",
      geo: "Bangalore",
      budgetAmount: 10,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/p",
    });
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    const result = await publishMetaLaunchPlan(
      plan,
      {
        META_ADS_ACCESS_TOKEN: "tok",
        META_ADS_AD_ACCOUNT_ID: "123",
        META_ADS_APP_ID: "app",
        // missing SECRET + PAGE
      },
      { fetchImpl },
    );
    assert.equal(called, false);
    assert.equal(result.status, "pending_configuration");
    assert.equal(result.metaCreated, false);
  });

  it("with full credentials creates paused campaign and returns Meta ids", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-1023B",
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
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        status?: string;
        promoted_object?: { page_id?: string; pixel_id?: string };
        destination_type?: string;
      };
      if (url.includes("/campaigns") || url.includes("/adsets") || url.includes("/ads")) {
        assert.equal(body.status, "PAUSED");
      }
      if (url.includes("/campaigns")) {
        return new Response(JSON.stringify({ id: "camp_1" }), { status: 200 });
      }
      if (url.includes("/adsets")) {
        assert.equal(body.destination_type, "WEBSITE");
        assert.equal(body.promoted_object?.page_id, "page");
        assert.equal(body.promoted_object?.pixel_id, "pixel_123");
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
    const result = await publishMetaLaunchPlan(plan, FULL_ENV, { fetchImpl });
    assert.equal(result.status, "created_paused");
    assert.equal(result.metaCreated, true);
    assert.equal(result.campaign_id, "camp_1");
    assert.equal(result.adset_id, "adset_1");
    assert.equal(result.ad_id, "ad_1");
    assert.equal(result.external.campaignId, "camp_1");
    assert.ok(calls.some((u) => u.includes("/campaigns")));
    assert.ok(calls.some((u) => u.includes("access_token=")));
  });

  it("surfaces Meta API error without claiming created success", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-ERR",
      geo: "Mumbai",
      budgetAmount: 20,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/p",
    });
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { message: "Invalid OAuth access token", code: 190 },
        }),
        { status: 400 },
      );
    const result = await publishMetaLaunchPlan(plan, FULL_ENV, { fetchImpl });
    assert.equal(result.status, "error");
    assert.equal(result.metaCreated, false);
    assert.equal(result.campaign_id, null);
    assert.match(result.detail, /Invalid OAuth|failed/i);
  });

  it("blocks publish before Graph when pixel missing for website leads", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-NO-PIXEL",
      geo: "Bangalore",
      budgetAmount: 15,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/p",
    });
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    const envNoPixel = { ...FULL_ENV, META_ADS_PIXEL_ID: undefined };
    delete (envNoPixel as { META_ADS_PIXEL_ID?: string }).META_ADS_PIXEL_ID;
    const result = await publishMetaLaunchPlan(plan, envNoPixel, { fetchImpl });
    assert.equal(called, false);
    assert.equal(result.status, "error");
    assert.match(result.detail, /Pixel ID required/i);
  });

  it("resumes from existing campaign id without creating a duplicate campaign", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-RESUME",
      geo: "Bangalore",
      budgetAmount: 15,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/p",
    });
    let campaignPosts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/campaigns")) campaignPosts += 1;
      if (url.includes("/adsets")) {
        return new Response(JSON.stringify({ id: "adset_new" }), { status: 200 });
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
    const result = await publishMetaLaunchPlan(plan, FULL_ENV, {
      fetchImpl,
      resumeExternal: { campaignId: "120249589612440250" },
    });
    assert.equal(campaignPosts, 0);
    assert.equal(result.status, "created_paused");
    assert.equal(result.campaign_id, "120249589612440250");
    assert.equal(result.adset_id, "adset_new");
  });

  it("parses stored meta ids and infers campaign-only resume when ad missing", () => {
    const adCopy = [
      "Copy",
      "",
      "[Meta AI — error]",
      "campaign_id=120249589612440250",
      "adset_id=120249589612580250",
      "ad_id=",
    ].join("\n");
    const stored = parseMetaIdsFromAdCopy(adCopy);
    assert.equal(stored.campaignId, "120249589612440250");
    assert.equal(stored.adSetId, "120249589612580250");
    assert.equal(stored.adId, null);
    const resume = inferMetaResumeAfterPartialFailure(stored, null);
    assert.deepEqual(resume, {
      campaignId: "120249589612440250",
      adSetId: null,
      adId: null,
    });
  });
});
