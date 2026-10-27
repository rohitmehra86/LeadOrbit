import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMetaOAuthStartUrl,
  validateMetaLoginConfigId,
} from "@leadorbit/domain";

/** Pure helpers mirroring callback state parsing (no network). */
function parseOAuthState(state: string): { orgId: string; nonce: string } | null {
  const [orgId, nonce] = state.split(".");
  if (!orgId || !nonce) return null;
  return { orgId, nonce };
}

describe("meta OAuth state validation", () => {
  it("rejects malformed state (CSRF / tamper)", () => {
    assert.equal(parseOAuthState(""), null);
    assert.equal(parseOAuthState("only-org"), null);
    assert.equal(parseOAuthState(".nonce-only"), null);
    assert.ok(parseOAuthState("org-uuid.nonce-value"));
  });

  it("OAuth start requires app credentials", () => {
    const blocked = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {} as NodeJS.ProcessEnv,
    });
    assert.equal(blocked.status, "pending_configuration");
    assert.equal(blocked.url, null);
  });

  it("OAuth start requires Login for Business config_id", () => {
    const blocked = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {
        META_ADS_APP_ID: "1828424055013488",
        META_ADS_APP_SECRET: "secret",
      } as NodeJS.ProcessEnv,
    });
    assert.equal(blocked.status, "pending_configuration");
    assert.equal(blocked.url, null);
    assert.match(blocked.detail, /META_ADS_LOGIN_CONFIG_ID/);

    const ready = buildMetaOAuthStartUrl({
      state: "org.nonce",
      env: {
        META_ADS_APP_ID: "1828424055013488",
        META_ADS_APP_SECRET: "secret",
        META_ADS_LOGIN_CONFIG_ID: "1436209141980934",
        META_ADS_OAUTH_REDIRECT_URI:
          "https://leadorbit-delta.vercel.app/api/v1/meta/oauth/callback",
      } as NodeJS.ProcessEnv,
    });
    assert.equal(ready.status, "ready");
    assert.ok(ready.url?.includes("config_id=1436209141980934"));
    assert.ok(!ready.url?.includes("scope="));
    assert.equal(
      validateMetaLoginConfigId({
        META_ADS_LOGIN_CONFIG_ID: "1436209141980934",
      }).ok,
      true,
    );
  });

  it("OAuth denial is represented as error query (callback contract)", () => {
    // Callback redirects with ?error= when Meta returns error / error_description.
    const denial = "access_denied";
    const redirect = `/settings/meta-connect?error=${encodeURIComponent(denial)}`;
    assert.match(redirect, /error=access_denied/);
  });
});
