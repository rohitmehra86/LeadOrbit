/**
 * Meta Marketing API OAuth helpers (platform APP_ID/SECRET + per-org user token).
 */

import {
  metaAdsSetupHints,
  readMetaAdsCredentialsFromEnv,
  type MetaAdsCredentialStatus,
} from "./meta-ads";

export const META_OAUTH_SCOPES = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export type MetaOrgConnectionInput = {
  accessToken?: string | null;
  adAccountId?: string | null;
  pageId?: string | null;
  tokenExpiresAt?: string | null;
};

export type MetaRuntimeCredentials = {
  appId: string | null;
  appSecret: string | null;
  accessToken: string | null;
  adAccountId: string | null;
  pageId: string | null;
  /** Where token/account/page came from */
  source: "org" | "env" | "mixed" | "none";
  platformAppReady: boolean;
};

export function metaOAuthRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.META_ADS_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const appUrl = (env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:43127").replace(
    /\/$/,
    "",
  );
  return `${appUrl}/api/v1/meta/oauth/callback`;
}

export function metaOAuthSetupHints(): string[] {
  return [
    ...metaAdsSetupHints().filter((h) => !/ACCESS_TOKEN|AD_ACCOUNT|PAGE_ID/.test(h)),
    "Add Valid OAuth Redirect URI in Meta App → Facebook Login → Settings",
    `Redirect URI: ${metaOAuthRedirectUri()}`,
    "Customers Connect Meta in LeadOrbit (per org) — no per-tenant secrets on Vercel",
    "External in Meta: App Live, Privacy Policy URL, Ad Account billing",
  ];
}

/** Resolve credentials: org connection overrides env token/account/page; APP_* always from env. */
export function resolveMetaAdsCredentials(
  env: NodeJS.ProcessEnv = process.env,
  org?: Partial<MetaOrgConnectionInput> | null,
): MetaRuntimeCredentials {
  const fromEnv = readMetaAdsCredentialsFromEnv(env);
  const orgToken = org?.accessToken?.trim() || null;
  const orgAct = org?.adAccountId?.trim() || null;
  const orgPage = org?.pageId?.trim() || null;

  const accessToken = orgToken || fromEnv.accessToken;
  const adAccountId = orgAct || fromEnv.adAccountId;
  const pageId = orgPage || fromEnv.pageId;

  const platformAppReady = Boolean(fromEnv.appId && fromEnv.appSecret);
  let source: MetaRuntimeCredentials["source"] = "none";
  if (orgToken && orgAct && orgPage) source = "org";
  else if (fromEnv.accessToken && fromEnv.adAccountId && fromEnv.pageId) source = "env";
  else if (accessToken || adAccountId || pageId) source = "mixed";

  return {
    appId: fromEnv.appId,
    appSecret: fromEnv.appSecret,
    accessToken,
    adAccountId,
    pageId,
    source,
    platformAppReady,
  };
}

export function metaRuntimeCredentialStatus(
  creds: MetaRuntimeCredentials,
): {
  status: MetaAdsCredentialStatus;
  detail: string;
  present: Record<string, boolean>;
  setupHints: string[];
  source: MetaRuntimeCredentials["source"];
} {
  const present = {
    META_ADS_APP_ID: Boolean(creds.appId),
    META_ADS_APP_SECRET: Boolean(creds.appSecret),
    META_ADS_ACCESS_TOKEN: Boolean(creds.accessToken),
    META_ADS_AD_ACCOUNT_ID: Boolean(creds.adAccountId),
    META_ADS_PAGE_ID: Boolean(creds.pageId),
    ORG_META_CONNECTION: creds.source === "org",
  };
  const hints = metaOAuthSetupHints();
  const ready = Boolean(
    creds.appId &&
      creds.appSecret &&
      creds.accessToken &&
      creds.adAccountId &&
      creds.pageId,
  );
  if (ready) {
    return {
      status: "ready",
      detail:
        creds.source === "org"
          ? "Org Meta connection ready — Approve will call Marketing API"
          : "Env META_ADS_* ready — Approve will call Marketing API (or Connect Meta per org)",
      present,
      setupHints: hints,
      source: creds.source,
    };
  }
  if (creds.accessToken && creds.adAccountId && !creds.pageId) {
    return {
      status: "partial",
      detail: "Token + ad account present; select a Page to finish Connect Meta",
      present,
      setupHints: hints,
      source: creds.source,
    };
  }
  if (!creds.platformAppReady) {
    return {
      status: "pending_configuration",
      detail:
        "Platform META_ADS_APP_ID / META_ADS_APP_SECRET missing on Vercel — OAuth cannot start",
      present,
      setupHints: hints,
      source: creds.source,
    };
  }
  return {
    status: "pending_configuration",
    detail:
      "Connect Meta for this organization (OAuth) or set global META_ADS_ACCESS_TOKEN + AD_ACCOUNT_ID + PAGE_ID",
    present,
    setupHints: hints,
    source: creds.source,
  };
}

export function buildMetaOAuthStartUrl(input: {
  state: string;
  redirectUri?: string;
  env?: NodeJS.ProcessEnv;
}): {
  status: "pending_configuration" | "ready";
  detail: string;
  url: string | null;
  redirectUri: string;
  setupHints: string[];
} {
  const env = input.env ?? process.env;
  const hints = metaOAuthSetupHints();
  const appId = env.META_ADS_APP_ID?.trim();
  const redirectUri = input.redirectUri || metaOAuthRedirectUri(env);
  if (!appId || !env.META_ADS_APP_SECRET?.trim()) {
    return {
      status: "pending_configuration",
      detail: "META_ADS_APP_ID and META_ADS_APP_SECRET required to start OAuth",
      url: null,
      redirectUri,
      setupHints: hints,
    };
  }
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: input.state,
    response_type: "code",
    scope: META_OAUTH_SCOPES,
  });
  return {
    status: "ready",
    detail: "OAuth start URL ready",
    url: `https://www.facebook.com/v21.0/dialog/oauth?${params}`,
    redirectUri,
    setupHints: hints,
  };
}

export async function exchangeMetaOAuthCode(
  code: string,
  opts?: {
    env?: NodeJS.ProcessEnv;
    redirectUri?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{
  ok: boolean;
  accessToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  const env = opts?.env ?? process.env;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const appId = env.META_ADS_APP_ID?.trim();
  const appSecret = env.META_ADS_APP_SECRET?.trim();
  const redirectUri = opts?.redirectUri || metaOAuthRedirectUri(env);
  if (!appId || !appSecret) {
    return { ok: false, error: "META_ADS_APP_ID / META_ADS_APP_SECRET missing" };
  }
  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !raw.access_token) {
    return {
      ok: false,
      error: raw.error?.message ?? `Token exchange HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    accessToken: raw.access_token,
    expiresIn: raw.expires_in,
  };
}

/** Exchange short-lived user token for long-lived (~60 days). */
export async function exchangeMetaLongLivedToken(
  shortLivedToken: string,
  opts?: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch },
): Promise<{
  ok: boolean;
  accessToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  const env = opts?.env ?? process.env;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const appId = env.META_ADS_APP_ID?.trim();
  const appSecret = env.META_ADS_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { ok: false, error: "META_ADS_APP_ID / META_ADS_APP_SECRET missing" };
  }
  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !raw.access_token) {
    return {
      ok: false,
      error: raw.error?.message ?? `Long-lived exchange HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    accessToken: raw.access_token,
    expiresIn: raw.expires_in,
  };
}

export type MetaAdAccountOption = {
  id: string;
  name: string;
  account_id?: string;
};

export type MetaPageOption = {
  id: string;
  name: string;
};

export async function fetchMetaAdAccounts(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: MetaAdAccountOption[]; error?: string }> {
  const url = new URL("https://graph.facebook.com/v21.0/me/adaccounts");
  url.searchParams.set("fields", "id,name,account_id");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    data?: MetaAdAccountOption[];
    error?: { message?: string };
  };
  if (!res.ok || raw.error) {
    return {
      ok: false,
      items: [],
      error: raw.error?.message ?? `Ad accounts HTTP ${res.status}`,
    };
  }
  return { ok: true, items: raw.data ?? [] };
}

export async function fetchMetaPages(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: MetaPageOption[]; error?: string }> {
  const url = new URL("https://graph.facebook.com/v21.0/me/accounts");
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    data?: MetaPageOption[];
    error?: { message?: string };
  };
  if (!res.ok || raw.error) {
    return {
      ok: false,
      items: [],
      error: raw.error?.message ?? `Pages HTTP ${res.status}`,
    };
  }
  return { ok: true, items: raw.data ?? [] };
}
