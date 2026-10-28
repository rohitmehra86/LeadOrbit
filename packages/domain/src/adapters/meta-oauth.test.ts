import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMetaOAuthStartUrl,
  isValidMetaLoginConfigId,
  META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS,
  metaRuntimeCredentialStatus,
  resolveMetaAdsCredentials,
  summarizeMetaPermissionGap,
  validateMetaLoginConfigId,
} from "./meta-oauth";
import { publishMetaLaunchPlan, buildMetaLaunchPlan } from "./meta-ads";

const LEADORBIT_LOGIN_CONFIG_ID = "1436209141980934";

describe("meta OAuth credentials", () => {
  it("prefers org connection over env token/account/page", () => {
    const env = {
      META_ADS_APP_ID: "app",
      META_ADS_APP_SECRET: "secret",
      META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
      META_ADS_ACCESS_TOKEN: "env-token",
      META_ADS_AD_ACCOUNT_ID: "act_env",
      META_ADS_PAGE_ID: "page_env",
      META_ADS_PIXEL_ID: "pixel_env",
    };
    const runtime = resolveMetaAdsCredentials(
      env,
      {
        accessToken: "org-token",
        adAccountId: "act_org",
        pageId: "page_org",
        pixelId: "pixel_org",
        leadGenFormId: "form_org",
      },
    );
    assert.equal(runtime.source, "org");
    assert.equal(runtime.accessToken, "org-token");
    assert.equal(runtime.adAccountId, "act_org");
    assert.equal(runtime.pageId, "page_org");
    assert.equal(runtime.pixelId, "pixel_org");
    assert.equal(runtime.leadGenFormId, "form_org");
    assert.equal(runtime.appId, "app");
    const status = metaRuntimeCredentialStatus(runtime, env);
    assert.equal(status.status, "ready");
    assert.equal(status.present.META_ADS_LOGIN_CONFIG_ID, true);
    assert.equal(status.present.META_ADS_PIXEL_ID, true);
    assert.equal(status.present.ORG_META_PIXEL, true);
  });

  it("lists page access tokens from /me/accounts for Instant Forms", async () => {
    const { resolveMetaPageAccessToken, fetchMetaPages } = await import(
      "./meta-oauth"
    );
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      assert.match(url, /me\/accounts/);
      assert.match(url, /access_token/);
      return new Response(
        JSON.stringify({
          data: [
            { id: "page1", name: "Page One", access_token: "PAGE_TOK" },
            { id: "page2", name: "Page Two" },
          ],
        }),
        { status: 200 },
      );
    };
    const pages = await fetchMetaPages("USER_TOK", fetchImpl);
    assert.equal(pages.ok, true);
    assert.equal(pages.items[0]?.accessToken, "PAGE_TOK");
    const resolved = await resolveMetaPageAccessToken(
      "USER_TOK",
      "page1",
      fetchImpl,
    );
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pageAccessToken, "PAGE_TOK");
    const missing = await resolveMetaPageAccessToken(
      "USER_TOK",
      "page2",
      fetchImpl,
    );
    assert.equal(missing.ok, false);
  });

  it("falls back to business pixels when ad account pixel list is empty", async () => {
    const { fetchMetaAdAccountPixels } = await import("./meta-oauth");
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/adspixels")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes("fields=business") || url.includes("business%7Bid")) {
        return new Response(
          JSON.stringify({ business: { id: "biz1", name: "Biz" } }),
          { status: 200 },
        );
      }
      if (url.includes("/owned_pixels")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "pixel_biz", name: "Biz Pixel" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/client_pixels")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected" } }), {
        status: 400,
      });
    };
    const pixels = await fetchMetaAdAccountPixels(
      "tok",
      "act_123",
      fetchImpl,
    );
    assert.equal(pixels.ok, true);
    assert.equal(pixels.items[0]?.id, "pixel_biz");
  });

  it("does not mix env Pixel onto an org Connect Meta connection", () => {
    const env = {
      META_ADS_APP_ID: "app",
      META_ADS_APP_SECRET: "secret",
      META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
      META_ADS_PIXEL_ID: "pixel_env_wrong_account",
      META_ADS_LEAD_GEN_FORM_ID: "form_env",
    };
    const runtime = resolveMetaAdsCredentials(env, {
      accessToken: "org-token",
      adAccountId: "act_org",
      pageId: "page_org",
      // no org pixel/form selected
    });
    assert.equal(runtime.source, "org");
    assert.equal(runtime.pixelId, null);
    assert.equal(runtime.leadGenFormId, null);
    const status = metaRuntimeCredentialStatus(runtime, env);
    assert.equal(status.present.META_ADS_PIXEL_ID, true);
    assert.equal(status.present.ORG_META_PIXEL, false);
    assert.equal(status.present.ORG_META_LEAD_FORM, false);
  });

  it("falls back to env when org missing and META_ADS_ALLOW_ENV_FALLBACK=true", () => {
    const env = {
      META_ADS_APP_ID: "app",
      META_ADS_APP_SECRET: "secret",
      META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
      META_ADS_ALLOW_ENV_FALLBACK: "true",
      META_ADS_ACCESS_TOKEN: "env-token",
      META_ADS_AD_ACCOUNT_ID: "act_env",
      META_ADS_PAGE_ID: "page_env",
    };
    const runtime = resolveMetaAdsCredentials(env, null);
    assert.equal(runtime.source, "env");
    assert.equal(metaRuntimeCredentialStatus(runtime, env).status, "ready");
  });

  it("requires Connect Meta when env fallback is off", () => {
    const env = {
      META_ADS_APP_ID: "app",
      META_ADS_APP_SECRET: "secret",
      META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
      META_ADS_ACCESS_TOKEN: "env-token",
      META_ADS_AD_ACCOUNT_ID: "act_env",
      META_ADS_PAGE_ID: "page_env",
    };
    const runtime = resolveMetaAdsCredentials(env, null);
    assert.equal(runtime.source, "none");
    assert.equal(runtime.accessToken, null);
    const status = metaRuntimeCredentialStatus(runtime, env);
    assert.equal(status.status, "pending_configuration");
    assert.match(status.detail, /Connect Meta/i);
  });

  it("validates Login for Business configuration id shape", () => {
    assert.equal(isValidMetaLoginConfigId(LEADORBIT_LOGIN_CONFIG_ID), true);
    assert.equal(isValidMetaLoginConfigId("not-a-config"), false);
    assert.equal(isValidMetaLoginConfigId(""), false);
    assert.equal(
      validateMetaLoginConfigId({}).ok,
      false,
    );
    assert.equal(
      validateMetaLoginConfigId({
        META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
      }).ok,
      true,
    );
  });

  it("builds Login for Business OAuth URL with config_id and without scope", () => {
    const start = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {
        META_ADS_APP_ID: "1828424055013488",
        META_ADS_APP_SECRET: "sec",
        META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
        NEXT_PUBLIC_APP_URL: "https://leadorbit-delta.vercel.app",
      },
    });
    assert.equal(start.status, "ready");
    assert.equal(start.configId, LEADORBIT_LOGIN_CONFIG_ID);
    assert.ok(start.url?.includes("facebook.com"));
    assert.ok(start.url?.includes(`config_id=${LEADORBIT_LOGIN_CONFIG_ID}`));
    assert.ok(start.url?.includes("client_id=1828424055013488"));
    assert.ok(start.url?.includes(encodeURIComponent("org.nonce")));
    assert.ok(!start.url?.includes("scope="));
    assert.match(start.redirectUri, /meta\/oauth\/callback/);
    assert.ok(
      META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS.includes("ads_management"),
    );
    assert.ok(
      META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS.includes("leads_retrieval"),
    );
  });

  it("blocks OAuth start without app secret", () => {
    const start = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {
        META_ADS_APP_ID: "123",
        META_ADS_LOGIN_CONFIG_ID: LEADORBIT_LOGIN_CONFIG_ID,
      },
    });
    assert.equal(start.status, "pending_configuration");
    assert.equal(start.url, null);
  });

  it("blocks OAuth start without Login for Business config id", () => {
    const start = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {
        META_ADS_APP_ID: "1828424055013488",
        META_ADS_APP_SECRET: "sec",
      },
    });
    assert.equal(start.status, "pending_configuration");
    assert.equal(start.url, null);
    assert.match(start.detail, /META_ADS_LOGIN_CONFIG_ID/);
  });

  it("summarizes missing ads permissions on Login for Business tokens", () => {
    const gap = summarizeMetaPermissionGap([
      { permission: "pages_show_list", status: "granted" },
      { permission: "business_management", status: "granted" },
      { permission: "public_profile", status: "granted" },
    ]);
    assert.match(gap, /missing on token/);
    assert.match(gap, /ads_management/);
    assert.match(gap, /pages_show_list/);
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
        // env pixel must not satisfy org publish — org supplies its own
        META_ADS_PIXEL_ID: "pixel_env_ignored",
      },
      {
        fetchImpl,
        orgCredentials: {
          accessToken: "org-tok",
          adAccountId: "999",
          pageId: "page1",
          pixelId: "pixel_org",
        },
      },
    );
    assert.equal(result.status, "created_paused");
    assert.equal(result.campaign_id, "c1");
    assert.ok(calls.some((u) => u.includes("act_999")));
  });
});
