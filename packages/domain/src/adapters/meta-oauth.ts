/**
 * Meta Marketing API OAuth helpers (platform APP_ID/SECRET + per-org user token).
 * Connect Meta uses Facebook Login for Business (`config_id`), not consumer Login scopes alone.
 */

import {
  metaAdsSetupHints,
  readMetaAdsCredentialsFromEnv,
  type MetaAdsCredentialStatus,
} from "./meta-ads";

/** Keep inline (avoid circular import with meta-ads). */
function allowMetaAdsEnvFallback(env: NodeJS.ProcessEnv): boolean {
  return env.META_ADS_ALLOW_ENV_FALLBACK?.trim().toLowerCase() === "true";
}

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
    ...metaAdsSetupHints().filter((h) => !/ALLOW_ENV_FALLBACK|ACCESS_TOKEN|AD_ACCOUNT|PAGE_ID/.test(h)),
    "Set META_ADS_LOGIN_CONFIG_ID to a User access token Login for Business configuration id",
    "Add Valid OAuth Redirect URI in Meta App → Facebook Login → Settings",
    `Redirect URI: ${metaOAuthRedirectUri()}`,
    `Login for Business permissions: ${META_LOGIN_FOR_BUSINESS_REQUIRED_PERMISSIONS.join(", ")}`,
    "Connect Meta per organization (OAuth) — primary path; no customer secrets on Vercel",
    "External in Meta: App Live, Privacy Policy URL, Ad Account billing",
  ];
}

/**
 * Resolve credentials for Marketing API.
 * Primary: org Connect Meta (token + ad account + Page).
 * Env ACCESS_TOKEN / AD_ACCOUNT / PAGE only when META_ADS_ALLOW_ENV_FALLBACK=true (platform demo).
 * APP_ID / APP_SECRET / LOGIN_CONFIG_ID always from env.
 */
export function resolveMetaAdsCredentials(
  env: NodeJS.ProcessEnv = process.env,
  org?: Partial<MetaOrgConnectionInput> | null,
): MetaRuntimeCredentials {
  const fromEnv = readMetaAdsCredentialsFromEnv(env);
  const allowEnvFallback = allowMetaAdsEnvFallback(env);
  const orgToken = org?.accessToken?.trim() || null;
  const orgAct = org?.adAccountId?.trim() || null;
  const orgPage = org?.pageId?.trim() || null;
  const orgPixel = org?.pixelId?.trim() || null;
  const orgForm = org?.leadGenFormId?.trim() || null;

  const envToken = allowEnvFallback ? fromEnv.accessToken : null;
  const envAct = allowEnvFallback ? fromEnv.adAccountId : null;
  const envPage = allowEnvFallback ? fromEnv.pageId : null;

  const accessToken = orgToken || envToken;
  const adAccountId = orgAct || envAct;
  const pageId = orgPage || envPage;

  const platformAppReady = Boolean(fromEnv.appId && fromEnv.appSecret);
  let source: MetaRuntimeCredentials["source"] = "none";
  if (orgToken && orgAct && orgPage) source = "org";
  else if (allowEnvFallback && envToken && envAct && envPage) source = "env";
  else if (accessToken || adAccountId || pageId) source = "mixed";

  // Org path: only org Pixel/Form (never mix a Vercel env Pixel onto a customer ad account).
  // Env fallback path: use env Pixel/Form for platform demo only.
  const pixelId =
    source === "org"
      ? orgPixel
      : source === "env"
        ? fromEnv.pixelId
        : orgPixel || (allowEnvFallback ? fromEnv.pixelId : null);
  const leadGenFormId =
    source === "org"
      ? orgForm
      : source === "env"
        ? fromEnv.leadGenFormId
        : orgForm || (allowEnvFallback ? fromEnv.leadGenFormId : null);

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
  const allowEnvFallback = allowMetaAdsEnvFallback(env);
  const present = {
    META_ADS_APP_ID: Boolean(creds.appId),
    META_ADS_APP_SECRET: Boolean(creds.appSecret),
    META_ADS_LOGIN_CONFIG_ID: Boolean(readMetaLoginConfigId(env)),
    META_ADS_ACCESS_TOKEN: Boolean(readMetaAdsCredentialsFromEnv(env).accessToken),
    META_ADS_AD_ACCOUNT_ID: Boolean(readMetaAdsCredentialsFromEnv(env).adAccountId),
    META_ADS_PAGE_ID: Boolean(readMetaAdsCredentialsFromEnv(env).pageId),
    META_ADS_PIXEL_ID: Boolean(readMetaAdsCredentialsFromEnv(env).pixelId),
    META_ADS_LEAD_GEN_FORM_ID: Boolean(
      readMetaAdsCredentialsFromEnv(env).leadGenFormId,
    ),
    META_ADS_ALLOW_ENV_FALLBACK: allowEnvFallback,
