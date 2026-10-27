import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertMetaLaunchApproved,
  buildMetaLaunchPlan,
  metaAdsCredentialStatus,
  metaAdsReadyForCreate,
  publishMetaLaunchPlan,
} from "@leadorbit/domain";

const emptyEnv = {} as NodeJS.ProcessEnv;

describe("meta AI launch gate (web)", () => {
  it("plan → approval required → pending without token (no fake live)", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "Test offer",
      geo: "Bangalore",
      budgetAmount: 20,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
    });
    assert.throws(() => assertMetaLaunchApproved(false), /approval/i);
    assertMetaLaunchApproved(true);
    const status = metaAdsCredentialStatus(emptyEnv);
    assert.equal(status.status, "pending_configuration");
    assert.equal(metaAdsReadyForCreate(emptyEnv), false);
    const result = await publishMetaLaunchPlan(plan, emptyEnv);
    assert.equal(result.status, "pending_configuration");
    assert.equal(result.metaCreated, false);
    assert.equal(result.campaign_id, null);
    assert.match(result.detail, /blocked|credentials|META_ADS/i);
  });

  it("created result exposes snake_case Meta ids", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-IDS",
      geo: "Bangalore",
      budgetAmount: 12,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/x",
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/campaigns")) {
        return new Response(JSON.stringify({ id: "c1" }), { status: 200 });
      }
      if (url.includes("/adsets")) {
        return new Response(JSON.stringify({ id: "s1" }), { status: 200 });
      }
      if (url.includes("/adcreatives")) {
        return new Response(JSON.stringify({ id: "cr1" }), { status: 200 });
      }
      if (url.includes("/ads")) {
        return new Response(JSON.stringify({ id: "a1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "no" } }), {
        status: 400,
      });
    };
    const result = await publishMetaLaunchPlan(
      plan,
      {
        META_ADS_APP_ID: "a",
        META_ADS_APP_SECRET: "s",
        META_ADS_ALLOW_ENV_FALLBACK: "true",
        META_ADS_ACCESS_TOKEN: "t",
        META_ADS_AD_ACCOUNT_ID: "1",
        META_ADS_PAGE_ID: "p",
        META_ADS_PIXEL_ID: "pixel_1",
      } as unknown as NodeJS.ProcessEnv,
      { fetchImpl },
    );
    assert.equal(result.status, "created_paused");
    assert.deepEqual(
      {
        campaign_id: result.campaign_id,
        adset_id: result.adset_id,
        ad_id: result.ad_id,
      },
      { campaign_id: "c1", adset_id: "s1", ad_id: "a1" },
    );
  });

  it("paused by default when enableSpend is false", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-TEST-PAUSED",
      geo: "Bangalore",
      budgetAmount: 12,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/x",
      enableSpend: false,
    });
    let lastStatus: string | null = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.body) {
        const body = JSON.parse(String(init.body)) as { status?: string };
        if (body.status) lastStatus = body.status;
      }
      if (url.includes("/campaigns")) {
        return new Response(JSON.stringify({ id: "c1" }), { status: 200 });
      }
      if (url.includes("/adsets")) {
        return new Response(JSON.stringify({ id: "s1" }), { status: 200 });
      }
      if (url.includes("/adcreatives")) {
        return new Response(JSON.stringify({ id: "cr1" }), { status: 200 });
      }
      if (url.includes("/ads")) {
        return new Response(JSON.stringify({ id: "a1" }), { status: 200 });
      }
      return new Response("{}", { status: 400 });
    };
    const result = await publishMetaLaunchPlan(
      plan,
      {
        META_ADS_APP_ID: "a",
        META_ADS_APP_SECRET: "s",
        META_ADS_ALLOW_ENV_FALLBACK: "true",
        META_ADS_ACCESS_TOKEN: "t",
        META_ADS_AD_ACCOUNT_ID: "1",
        META_ADS_PAGE_ID: "p",
        META_ADS_PIXEL_ID: "pixel_1",
      } as unknown as NodeJS.ProcessEnv,
      { fetchImpl },
    );
    assert.equal(result.status, "created_paused");
    assert.equal(lastStatus, "PAUSED");
  });
});
