import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMetaOAuthStartUrl,
  metaRuntimeCredentialStatus,
  resolveMetaAdsCredentials,
} from "./meta-oauth";
import { publishMetaLaunchPlan, buildMetaLaunchPlan } from "./meta-ads";

describe("meta OAuth credentials", () => {
  it("prefers org connection over env token/account/page", () => {
    const runtime = resolveMetaAdsCredentials(
      {
        META_ADS_APP_ID: "app",
        META_ADS_APP_SECRET: "secret",
        META_ADS_ACCESS_TOKEN: "env-token",
        META_ADS_AD_ACCOUNT_ID: "act_env",
        META_ADS_PAGE_ID: "page_env",
      },
      {
        accessToken: "org-token",
        adAccountId: "act_org",
        pageId: "page_org",
      },
    );
    assert.equal(runtime.source, "org");
    assert.equal(runtime.accessToken, "org-token");
    assert.equal(runtime.adAccountId, "act_org");
    assert.equal(runtime.pageId, "page_org");
    assert.equal(runtime.appId, "app");
    assert.equal(metaRuntimeCredentialStatus(runtime).status, "ready");
  });

  it("falls back to env when org missing", () => {
    const runtime = resolveMetaAdsCredentials(
      {
        META_ADS_APP_ID: "app",
        META_ADS_APP_SECRET: "secret",
        META_ADS_ACCESS_TOKEN: "env-token",
        META_ADS_AD_ACCOUNT_ID: "act_env",
        META_ADS_PAGE_ID: "page_env",
      },
      null,
    );
    assert.equal(runtime.source, "env");
    assert.equal(metaRuntimeCredentialStatus(runtime).status, "ready");
  });

  it("builds OAuth start URL when app credentials exist", () => {
    const start = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {
        META_ADS_APP_ID: "123",
        META_ADS_APP_SECRET: "sec",
        NEXT_PUBLIC_APP_URL: "https://leadorbit-delta.vercel.app",
      },
    });
    assert.equal(start.status, "ready");
    assert.ok(start.url?.includes("facebook.com"));
    assert.ok(start.url?.includes("ads_management"));
    assert.match(start.redirectUri, /meta\/oauth\/callback/);
  });

  it("publish uses org credentials override", async () => {
    const plan = buildMetaLaunchPlan({
      businessOrOffer: "META-OAUTH-TEST",
      geo: "Bangalore",
      budgetAmount: 10,
      budgetType: "daily",
      currency: "USD",
      objective: "lead_gen",
      landingPageUrl: "https://example.com/p",
    });
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
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
        META_ADS_APP_ID: "app",
        META_ADS_APP_SECRET: "secret",
        // no env token — org must supply
      },
      {
        fetchImpl,
        orgCredentials: {
          accessToken: "org-tok",
          adAccountId: "999",
          pageId: "page1",
        },
      },
    );
    assert.equal(result.status, "created_paused");
    assert.equal(result.campaign_id, "c1");
    assert.ok(calls.some((u) => u.includes("act_999")));
  });
});
