/**
 * Meta / Google Lead Ads adapters.
 * Never invent imported leads. Without credentials → pending_configuration.
 * With credentials → authorized_stub until live HTTP pull is verified.
 */

export type LeadAdsNetwork = "meta_lead_ads" | "google_lead_ads";

export type LeadAdsSyncStatus =
  | "pending_configuration"
  | "authorized_stub"
  | "imported"
  | "error";

export type NormalizedLeadAd = {
  externalId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  formName: string | null;
  campaignExternalId: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
};

export function leadAdsCredentialsPresent(network: LeadAdsNetwork): boolean {
  if (network === "meta_lead_ads") {
    // Token alone authorizes the stub; account/page IDs listed in setup hints for live pull.
    return Boolean(process.env.META_ADS_ACCESS_TOKEN);
  }
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
}

export function leadAdsSetupHints(network: LeadAdsNetwork): string[] {
  if (network === "meta_lead_ads") {
    return [
      "Set META_ADS_ACCESS_TOKEN (Marketing API user/system token)",
      "Set META_ADS_AD_ACCOUNT_ID or META_ADS_PAGE_ID",
      "Subscribe the Page to leadgen webhooks (optional inbound)",
    ];
  }
  return [
    "Set GOOGLE_ADS_DEVELOPER_TOKEN",
    "Set GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET + GOOGLE_ADS_REFRESH_TOKEN",
    "Set GOOGLE_ADS_CUSTOMER_ID for the Ads account",
  ];
}

export function authorizeLeadAdsNetwork(network: LeadAdsNetwork): {
  status: "pending_configuration" | "authorized_stub";
  detail: string;
  setupHints: string[];
} {
  const hints = leadAdsSetupHints(network);
  if (!leadAdsCredentialsPresent(network)) {
    return {
      status: "pending_configuration",
      detail: `${network} credentials missing — authorize/setup only; no live sync`,
      setupHints: hints,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${network} credentials present; live Lead Ads API pull not verified in this environment`,
    setupHints: hints,
  };
}

/** Normalize Meta leadgen-style payloads (fixtures / webhook bodies). */
export function normalizeMetaLeadAd(
  raw: Record<string, unknown>,
): NormalizedLeadAd | null {
  const fieldData = Array.isArray(raw.field_data)
    ? (raw.field_data as Array<{ name?: string; values?: string[] }>)
    : [];
  const map = new Map<string, string>();
  for (const f of fieldData) {
    if (f?.name && f.values?.[0]) map.set(String(f.name).toLowerCase(), f.values[0]);
  }
  const fullName =
    map.get("full_name") ||
    map.get("fullname") ||
    [map.get("first_name"), map.get("last_name")].filter(Boolean).join(" ") ||
    (typeof raw.full_name === "string" ? raw.full_name : null) ||
    (typeof raw.fullName === "string" ? raw.fullName : null);
  if (!fullName?.trim()) return null;
  const externalId = String(
    raw.leadgen_id ?? raw.id ?? raw.externalId ?? `meta_${Date.now()}`,
  );
  return {
    externalId,
    fullName: fullName.trim(),
    email: map.get("email") ?? (typeof raw.email === "string" ? raw.email : null),
    phone:
      map.get("phone_number") ??
      map.get("phone") ??
      (typeof raw.phone === "string" ? raw.phone : null),
    formName: typeof raw.form_name === "string" ? raw.form_name : null,
    campaignExternalId:
      typeof raw.campaign_id === "string"
        ? raw.campaign_id
        : typeof raw.ad_id === "string"
          ? raw.ad_id
          : null,
    createdAt: typeof raw.created_time === "string" ? raw.created_time : null,
    raw,
  };
}

/** Normalize Google Lead Form extension style payloads. */
export function normalizeGoogleLeadAd(
  raw: Record<string, unknown>,
): NormalizedLeadAd | null {
  const userColumnData = Array.isArray(raw.user_column_data)
    ? (raw.user_column_data as Array<{
        column_id?: string;
        string_value?: string;
      }>)
    : [];
  const map = new Map<string, string>();
  for (const c of userColumnData) {
    if (c?.column_id && c.string_value) {
      map.set(String(c.column_id).toLowerCase().replace(/-/g, "_"), c.string_value);
    }
  }
  const fullName =
    map.get("full_name") ||
    map.get("name") ||
    (typeof raw.fullName === "string" ? raw.fullName : null) ||
    (typeof raw.full_name === "string" ? raw.full_name : null);
  if (!fullName?.trim()) return null;
  const externalId = String(
    raw.lead_id ?? raw.gcl_id ?? raw.id ?? `google_${Date.now()}`,
  );
  return {
    externalId,
    fullName: fullName.trim(),
    email: map.get("email") ?? (typeof raw.email === "string" ? raw.email : null),
    phone:
      map.get("phone_number") ??
      map.get("phone") ??
      (typeof raw.phone === "string" ? raw.phone : null),
    formName: typeof raw.form_id === "string" ? raw.form_id : null,
    campaignExternalId:
      typeof raw.campaign_id === "string" ? raw.campaign_id : null,
    createdAt: typeof raw.api_version === "string" ? null : null,
    raw,
  };
}

export function normalizeLeadAdPayload(
  network: LeadAdsNetwork,
  raw: Record<string, unknown>,
): NormalizedLeadAd | null {
  return network === "meta_lead_ads"
    ? normalizeMetaLeadAd(raw)
    : normalizeGoogleLeadAd(raw);
}

/**
 * Pull Lead Ads from the network.
 * Always returns imported=0 for live HTTP (not wired).
 * When `fixtureLeads` provided (tests), normalizes and returns them — still not "live success".
 */
export function pullLeadAdsFromNetwork(input: {
  network: LeadAdsNetwork;
  fixtureLeads?: Record<string, unknown>[];
}): {
  status: LeadAdsSyncStatus;
  detail: string;
  imported: number;
  leads: NormalizedLeadAd[];
  setupHints: string[];
} {
  const auth = authorizeLeadAdsNetwork(input.network);
  if (auth.status === "pending_configuration") {
    return {
      status: "pending_configuration",
      detail: auth.detail,
      imported: 0,
      leads: [],
      setupHints: auth.setupHints,
    };
  }

  if (input.fixtureLeads?.length) {
    const leads = input.fixtureLeads
      .map((r) => normalizeLeadAdPayload(input.network, r))
      .filter((x): x is NormalizedLeadAd => Boolean(x));
    return {
      status: "imported",
      detail: `${input.network} fixture import (${leads.length}) — not a live Ads API claim`,
      imported: leads.length,
      leads,
      setupHints: auth.setupHints,
    };
  }

  // Credentials present but live Marketing/Ads API HTTP not implemented.
  return {
    status: "authorized_stub",
    detail: `${input.network} authorize ok; live lead ads pull not implemented — imported=0 (no fake leads)`,
    imported: 0,
    leads: [],
    setupHints: auth.setupHints,
  };
}
