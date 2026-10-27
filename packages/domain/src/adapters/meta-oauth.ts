/**
 * Meta Marketing API OAuth helpers (platform APP_ID/SECRET + per-org user token).
 * Connect Meta uses Facebook Login for Business (`config_id`), not consumer Login scopes alone.
 */

import {
  metaAdsSetupHints,
  readMetaAdsCredentialsFromEnv,
  type MetaAdsCredentialStatus,
} from "./meta-ads";

/**
 * Permissions LeadOrbit needs from the Login for Business configuration
 * (Meta App Dashboard → Facebook Login for Business → configurations).
 * Set these on the configuration itself; do not rely on `scope` in the dialog URL.
 */
export const META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "business_management",
  "leads_retrieval",
] as const;

/** @deprecated Prefer Login for Business config permissions; kept for docs/tests. */
export const META_OAUTH_SCOPES =
  META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS.join(",");

/** Numeric Meta Login for Business configuration id (e.g. LeadOrbitConfig). */
export function readMetaLoginConfigId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.META_ADS_LOGIN_CONFIG_ID?.trim();
  return value || null;
}

export function isValidMetaLoginConfigId(value: string): boolean {
  return /^\d{5,32}$/.test(value.trim());
}

export function validateMetaLoginConfigId(
  env: NodeJS.ProcessEnv = process.env,
): {
  ok: boolean;
  configId: string | null;
  detail: string;
} {
  const configId = readMetaLoginConfigId(env);
  if (!configId) {
    return {
      ok: false,
      configId: null,
      detail:
        "META_ADS_LOGIN_CONFIG_ID missing — set the Facebook Login for Business configuration id",
    };
  }
  if (!isValidMetaLoginConfigId(configId)) {
    return {
      ok: false,
      configId,
      detail:
        "META_ADS_LOGIN_CONFIG_ID must be the numeric configuration id from Meta App Dashboard",
    };
  }
  return {
    ok: true,
    configId,
    detail: "Login for Business configuration id ready",
  };
}
export type MetaOrgConnectionInput = {
  accessToken?: string | null;
  adAccountId?: string | null;
  pageId?: string | null;
  pixelId?: string | null;
  leadGenFormId?: string | null;
  tokenExpiresAt?: string | null;
};

export type MetaRuntimeCredentials = {
  appId: string | null;
  appSecret: string | null;
  accessToken: string | null;
  adAccountId: string | null;
  pageId: string | null;
  pixelId: string | null;
  leadGenFormId: string | null;
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
    "Set META_ADS_LOGIN_CONFIG_ID to the Facebook Login for Business configuration id (LeadOrbitConfig)",
    "Add Valid OAuth Redirect URI in Meta App → Facebook Login → Settings",
    `Redirect URI: ${metaOAuthRedirectUri()}`,
    `Login for Business config permissions: ${META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS.join(", ")}`,
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
  const orgPixel = org?.pixelId?.trim() || null;
  const orgForm = org?.leadGenFormId?.trim() || null;

  const accessToken = orgToken || fromEnv.accessToken;
  const adAccountId = orgAct || fromEnv.adAccountId;
  const pageId = orgPage || fromEnv.pageId;
  const pixelId = orgPixel || fromEnv.pixelId;
  const leadGenFormId = orgForm || fromEnv.leadGenFormId;

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
    pixelId,
    leadGenFormId,
    source,
    platformAppReady,
  };
}

export function metaRuntimeCredentialStatus(
  creds: MetaRuntimeCredentials,
  env: NodeJS.ProcessEnv = process.env,
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
    META_ADS_LOGIN_CONFIG_ID: Boolean(readMetaLoginConfigId(env)),
    META_ADS_ACCESS_TOKEN: Boolean(creds.accessToken),
    META_ADS_AD_ACCOUNT_ID: Boolean(creds.adAccountId),
    META_ADS_PAGE_ID: Boolean(creds.pageId),
    META_ADS_PIXEL_ID: Boolean(creds.pixelId),
    META_ADS_LEAD_GEN_FORM_ID: Boolean(creds.leadGenFormId),
    ORG_META_CONNECTION: creds.source === "org",
    ORG_META_PIXEL: Boolean(creds.pixelId),
    ORG_META_LEAD_FORM: Boolean(creds.leadGenFormId),
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
  configId: string | null;
  setupHints: string[];
} {
  const env = input.env ?? process.env;
  const hints = metaOAuthSetupHints();
  const appId = env.META_ADS_APP_ID?.trim();
  const redirectUri = input.redirectUri || metaOAuthRedirectUri(env);
  const configCheck = validateMetaLoginConfigId(env);
  if (!appId || !env.META_ADS_APP_SECRET?.trim()) {
    return {
      status: "pending_configuration",
      detail: "META_ADS_APP_ID and META_ADS_APP_SECRET required to start OAuth",
      url: null,
      redirectUri,
      configId: configCheck.configId,
      setupHints: hints,
    };
  }
  if (!configCheck.ok || !configCheck.configId) {
    return {
      status: "pending_configuration",
      detail: configCheck.detail,
      url: null,
      redirectUri,
      configId: configCheck.configId,
      setupHints: hints,
    };
  }
  // Facebook Login for Business: permissions come from the configuration.
  // Meta recommends omitting `scope` when `config_id` is present.
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: input.state,
    response_type: "code",
    config_id: configCheck.configId,
  });
  return {
    status: "ready",
    detail: "Facebook Login for Business OAuth start URL ready",
    url: `https://www.facebook.com/v21.0/dialog/oauth?${params}`,
    redirectUri,
    configId: configCheck.configId,
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

export type MetaGrantedPermission = {
  permission: string;
  status: string;
};

/** Inspect scopes on a user token (safe to surface status names; never the token). */
export async function fetchMetaTokenPermissions(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: MetaGrantedPermission[]; error?: string }> {
  const url = new URL("https://graph.facebook.com/v21.0/me/permissions");
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    data?: MetaGrantedPermission[];
    error?: { message?: string };
  };
  if (!res.ok || raw.error) {
    return {
      ok: false,
      items: [],
      error: raw.error?.message ?? `Permissions HTTP ${res.status}`,
    };
  }
  return { ok: true, items: raw.data ?? [] };
}

export function summarizeMetaPermissionGap(
  granted: MetaGrantedPermission[],
  required: readonly string[] = META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS,
): string {
  const allowed = new Set(
    granted.filter((p) => p.status === "granted").map((p) => p.permission),
  );
  const missing = required.filter((p) => !allowed.has(p));
  if (missing.length === 0) {
    return `granted: ${[...allowed].sort().join(", ") || "(none)"}`;
  }
  return `missing on token: ${missing.join(", ")} (granted: ${[...allowed].sort().join(", ") || "none"})`;
}

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

export type MetaPixelOption = {
  id: string;
  name: string;
};

export type MetaLeadFormOption = {
  id: string;
  name: string;
  status?: string;
};

function normalizeActId(id: string): string {
  const t = id.trim();
  return t.startsWith("act_") ? t : `act_${t}`;
}

/** List Meta Pixels for an ad account (website OUTCOME_LEADS promoted_object). */
export async function fetchMetaAdAccountPixels(
  accessToken: string,
  adAccountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: MetaPixelOption[]; error?: string }> {
  const act = normalizeActId(adAccountId);
  const url = new URL(`https://graph.facebook.com/v21.0/${act}/adspixels`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    data?: MetaPixelOption[];
    error?: { message?: string };
  };
  if (!res.ok || raw.error) {
    return {
      ok: false,
      items: [],
      error: raw.error?.message ?? `Pixels HTTP ${res.status}`,
    };
  }
  return { ok: true, items: raw.data ?? [] };
}

/** List Instant Forms on a Facebook Page (ON_AD lead destination). */
export async function fetchMetaPageLeadForms(
  accessToken: string,
  pageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: MetaLeadFormOption[]; error?: string }> {
  const url = new URL(
    `https://graph.facebook.com/v21.0/${pageId.trim()}/leadgen_forms`,
  );
  url.searchParams.set("fields", "id,name,status");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString());
  const raw = (await res.json().catch(() => ({}))) as {
    data?: MetaLeadFormOption[];
    error?: { message?: string };
  };
  if (!res.ok || raw.error) {
    return {
      ok: false,
      items: [],
      error: raw.error?.message ?? `Lead forms HTTP ${res.status}`,
    };
  }
  return { ok: true, items: raw.data ?? [] };
}
