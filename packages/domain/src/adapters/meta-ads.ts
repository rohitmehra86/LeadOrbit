/**
 * Meta Marketing API — AI-guided launch adapter.
 * Never fakes live ads. Without credentials → pending_configuration.
 * With credentials → Graph API create (PAUSED unless enableSpend approved).
 */

export type MetaAdsCredentialStatus =
  | "pending_configuration"
  | "ready"
  | "partial";

export type MetaLaunchBrief = {
  businessOrOffer: string;
  geo: string;
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  currency: string;
  objective: "lead_gen";
  landingPageUrl?: string | null;
  audienceBasics?: string | null;
  creativeText?: string | null;
  creativeImageUrl?: string | null;
  /** Explicit opt-in after approval — never silent ACTIVE spend. */
  enableSpend?: boolean;
};

export type MetaLaunchPlan = {
  id: string;
  network: "meta";
  name: string;
  objective: "OUTCOME_LEADS";
  geo: string;
  budgetType: "daily" | "lifetime";
  budgetAmount: number;
  currency: string;
  audienceSummary: string;
  primaryText: string;
  headline: string;
  callToAction: "LEARN_MORE" | "SIGN_UP";
  landingPageUrl: string | null;
  creativeImageUrl: string | null;
  enableSpend: boolean;
  checklist: string[];
  createdAt: string;
};

export type MetaExternalIds = {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
};

export type MetaPublishResult = {
  status:
    | "pending_configuration"
    | "created_paused"
    | "created_active"
    | "error";
  /** True only when Marketing API created at least a campaign id. */
  metaCreated: boolean;
  detail: string;
  setupHints: string[];
  present?: Record<string, boolean>;
  external: MetaExternalIds;
  /** Snake_case aliases for API clients / Network panel. */
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  plan: MetaLaunchPlan;
};

function emptyExternal(): MetaExternalIds {
  return { campaignId: null, adSetId: null, adId: null };
}

function withIds(
  external: MetaExternalIds,
): Pick<MetaPublishResult, "external" | "campaign_id" | "adset_id" | "ad_id"> {
  return {
    external,
    campaign_id: external.campaignId,
    adset_id: external.adSetId,
    ad_id: external.adId,
  };
}

const GRAPH_VERSION = "v21.0";

export function metaAdsSetupHints(): string[] {
  return [
    "Create a Meta App (Business type) in developers.facebook.com",
    "Add Marketing API product; generate a System User token with ads_management",
    "Set META_ADS_APP_ID and META_ADS_APP_SECRET on Vercel",
    "Set META_ADS_ACCESS_TOKEN (long-lived system user token)",
    "Set META_ADS_AD_ACCOUNT_ID (act_… or numeric id)",
    "Set META_ADS_PAGE_ID for the Page that owns the ads",
  ];
}

export function readMetaAdsCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): {
  appId: string | null;
  appSecret: string | null;
  accessToken: string | null;
  adAccountId: string | null;
  pageId: string | null;
} {
  return {
    appId: env.META_ADS_APP_ID?.trim() || null,
    appSecret: env.META_ADS_APP_SECRET?.trim() || null,
    accessToken: env.META_ADS_ACCESS_TOKEN?.trim() || null,
    adAccountId: env.META_ADS_AD_ACCOUNT_ID?.trim() || null,
    pageId: env.META_ADS_PAGE_ID?.trim() || null,
  };
}

export function metaAdsCredentialStatus(
  env: NodeJS.ProcessEnv = process.env,
): {
  status: MetaAdsCredentialStatus;
  detail: string;
  present: Record<string, boolean>;
  setupHints: string[];
} {
  const c = readMetaAdsCredentialsFromEnv(env);
  const present = {
    META_ADS_APP_ID: Boolean(c.appId),
    META_ADS_APP_SECRET: Boolean(c.appSecret),
    META_ADS_ACCESS_TOKEN: Boolean(c.accessToken),
    META_ADS_AD_ACCOUNT_ID: Boolean(c.adAccountId),
    META_ADS_PAGE_ID: Boolean(c.pageId),
  };
  const allOk = Boolean(
    c.appId && c.appSecret && c.accessToken && c.adAccountId && c.pageId,
  );
  const partialOk = Boolean(c.accessToken && c.adAccountId) && !allOk;
  if (allOk) {
    return {
      status: "ready",
      detail:
        "All META_ADS_* present — Approve will call Marketing API (PAUSED unless spend enabled)",
      present,
      setupHints: metaAdsSetupHints(),
    };
  }
  if (partialOk) {
    return {
      status: "partial",
      detail:
        "Incomplete META_ADS_* — need APP_ID, APP_SECRET, ACCESS_TOKEN, AD_ACCOUNT_ID, and PAGE_ID before create",
      present,
      setupHints: metaAdsSetupHints(),
    };
  }
  return {
    status: "pending_configuration",
    detail: "Meta credentials missing — drafts only; never marked live",
    present,
    setupHints: metaAdsSetupHints(),
  };
}

/** True only when create is allowed (all five META_ADS_* set). Partial ≠ ready. */
export function metaAdsCredentialsPresent(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return metaAdsCredentialStatus(env).status === "ready";
}

/** Alias used by API/UI — create requires ready, not partial. */
export function metaAdsReadyForCreate(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return metaAdsCredentialsPresent(env);
}

function slugBudgetLabel(amount: number, currency: string, type: "daily" | "lifetime") {
  return `${type === "daily" ? "Daily" : "Lifetime"} ${currency} ${amount}`;
}

/** Deterministic AI-style plan from essentials (LLM can enrich later when keyed). */
export function buildMetaLaunchPlan(
  brief: MetaLaunchBrief,
  opts?: { id?: string; now?: string },
): MetaLaunchPlan {
  const offer = brief.businessOrOffer.trim();
  const geo = brief.geo.trim() || "your area";
  const audience =
    brief.audienceBasics?.trim() ||
    `People in ${geo} interested in ${offer.slice(0, 80)}`;
  const primary =
    brief.creativeText?.trim() ||
    `${offer}. Serving ${geo}. Share your details — we will follow up fast.`;
  const headline =
    offer.length <= 40 ? offer : `${offer.slice(0, 37)}…`;
  const checklist = [
    "Review plan copy and geo",
    "Approve before any Meta API create",
    brief.enableSpend
      ? "Spend enablement requested — campaign will be ACTIVE if credentials exist"
      : "Default Meta status is PAUSED (no silent spend)",
    "Connect META_ADS_* credentials on Vercel for live create",
  ];
  return {
    id: opts?.id ?? cryptoRandomId(),
    network: "meta",
    name: offer.length <= 56 ? offer : `${offer.slice(0, 53)}…`,
    objective: "OUTCOME_LEADS",
    geo,
    budgetType: brief.budgetType,
    budgetAmount: Math.max(1, Number(brief.budgetAmount) || 0),
    currency: (brief.currency || "USD").toUpperCase(),
    audienceSummary: audience,
    primaryText: primary,
    headline,
    callToAction: "SIGN_UP",
    landingPageUrl: brief.landingPageUrl?.trim() || null,
    creativeImageUrl: brief.creativeImageUrl?.trim() || null,
    enableSpend: Boolean(brief.enableSpend),
    checklist,
    createdAt: opts?.now ?? new Date().toISOString(),
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `meta-plan-${Date.now().toString(36)}`;
}

function normalizeAdAccountId(id: string): string {
  const t = id.trim();
  return t.startsWith("act_") ? t : `act_${t}`;
}

function guessCountryCode(geo: string): string {
  const g = geo.toLowerCase();
  if (/india|bangalore|bengaluru|mumbai|delhi|hyderabad|chennai|kolkata|pune/.test(g)) {
    return "IN";
  }
  if (/\b(uk|united kingdom|london|manchester)\b/.test(g)) return "GB";
  if (/\b(uae|dubai|abu dhabi)\b/.test(g)) return "AE";
  return "US";
}

async function graphPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; id?: string; error?: string; raw: unknown }> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; error_user_msg?: string; code?: number };
  };
  if (!res.ok || raw.error) {
    return {
      ok: false,
      error:
        raw.error?.error_user_msg ||
        raw.error?.message ||
        `HTTP ${res.status}`,
      raw,
    };
  }
  return { ok: true, id: raw.id, raw };
}

/**
 * Publish approved plan to Meta. Caller must have collected explicit approval.
 * Incomplete META_ADS_* → pending_configuration (never claims created).
 * Graph failures → status error with Meta message (caller maps to non-2xx).
 */
export async function publishMetaLaunchPlan(
  plan: MetaLaunchPlan,
  env: NodeJS.ProcessEnv = process.env,
  deps?: {
    fetchImpl?: typeof fetch;
  },
): Promise<MetaPublishResult> {
  const hints = metaAdsSetupHints();
  const credStatus = metaAdsCredentialStatus(env);
  const fetchImpl = deps?.fetchImpl ?? fetch;
  if (!metaAdsReadyForCreate(env)) {
    return {
      status: "pending_configuration",
      metaCreated: false,
      detail: `Meta create blocked — ${credStatus.detail}. Local draft only. Add all META_ADS_* on Vercel Production, Redeploy, then Approve again.`,
      setupHints: hints,
      present: credStatus.present,
      plan,
      ...withIds(emptyExternal()),
    };
  }

  const creds = readMetaAdsCredentialsFromEnv(env);
  const token = creds.accessToken!;
  const act = normalizeAdAccountId(creds.adAccountId!);
  const pageId = creds.pageId!;
  const statusOnMeta = plan.enableSpend ? "ACTIVE" : "PAUSED";
  const dailyBudget =
    plan.budgetType === "daily"
      ? Math.round(plan.budgetAmount * 100)
      : undefined;
  const lifetimeBudget =
    plan.budgetType === "lifetime"
      ? Math.round(plan.budgetAmount * 100)
      : undefined;

  try {
    if (!plan.landingPageUrl?.trim()) {
      return {
        status: "error",
        metaCreated: false,
        detail:
          "Meta create blocked — landingPageUrl missing (needed for lead_gen link ad)",
        setupHints: hints,
        present: credStatus.present,
        plan,
        ...withIds(emptyExternal()),
      };
    }

    const campaign = await graphPost(
      `${act}/campaigns`,
      token,
      {
        name: plan.name,
        objective: plan.objective,
        status: statusOnMeta,
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
      },
      fetchImpl,
    );
    if (!campaign.ok || !campaign.id) {
      return {
        status: "error",
        metaCreated: false,
        detail: `Meta campaign create failed: ${campaign.error ?? "unknown"}`,
        setupHints: hints,
        present: credStatus.present,
        plan,
        ...withIds(emptyExternal()),
      };
    }

    const country = guessCountryCode(plan.geo);
    const adSetBody: Record<string, unknown> = {
      name: `${plan.name} — ${plan.geo}`,
      campaign_id: campaign.id,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LEAD_GENERATION",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      status: statusOnMeta,
      targeting: {
        geo_locations: { countries: [country] },
      },
    };
    if (dailyBudget) adSetBody.daily_budget = dailyBudget;
    if (lifetimeBudget) adSetBody.lifetime_budget = lifetimeBudget;

    const adSet = await graphPost(`${act}/adsets`, token, adSetBody, fetchImpl);
    if (!adSet.ok || !adSet.id) {
      return {
        status: "error",
        metaCreated: true,
        detail: `Meta campaign ${campaign.id} created but ad set failed: ${adSet.error ?? "unknown"}`,
        setupHints: hints,
        present: credStatus.present,
        plan,
        ...withIds({
          campaignId: campaign.id,
          adSetId: null,
          adId: null,
        }),
      };
    }

    const creative = await graphPost(
      `${act}/adcreatives`,
      token,
      {
        name: `${plan.name} — Creative`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            message: plan.primaryText,
            link: plan.landingPageUrl,
            name: plan.headline,
            call_to_action: { type: plan.callToAction },
            ...(plan.creativeImageUrl
              ? { picture: plan.creativeImageUrl }
              : {}),
          },
        },
      },
      fetchImpl,
    );
    if (!creative.ok || !creative.id) {
      return {
        status: "error",
        metaCreated: true,
        detail: `Meta campaign ${campaign.id} / ad set ${adSet.id} created but creative failed: ${creative.error ?? "unknown"}`,
        setupHints: hints,
        present: credStatus.present,
        plan,
        ...withIds({
          campaignId: campaign.id,
          adSetId: adSet.id,
          adId: null,
        }),
      };
    }

    const ad = await graphPost(
      `${act}/ads`,
      token,
      {
        name: `${plan.name} — Ad`,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: statusOnMeta,
      },
      fetchImpl,
    );
    if (!ad.ok || !ad.id) {
      return {
        status: "error",
        metaCreated: true,
        detail: `Meta campaign ${campaign.id} / ad set ${adSet.id} created but ad failed: ${ad.error ?? "unknown"}`,
        setupHints: hints,
        present: credStatus.present,
        plan,
        ...withIds({
          campaignId: campaign.id,
          adSetId: adSet.id,
          adId: null,
        }),
      };
    }

    const external = {
      campaignId: campaign.id,
      adSetId: adSet.id,
      adId: ad.id,
    };
    return {
      status: plan.enableSpend ? "created_active" : "created_paused",
      metaCreated: true,
      detail: plan.enableSpend
        ? `Meta created ACTIVE campaign_id=${campaign.id} adset_id=${adSet.id} ad_id=${ad.id} (${slugBudgetLabel(plan.budgetAmount, plan.currency, plan.budgetType)}). Confirm in Ads Manager.`
        : `Meta created PAUSED campaign_id=${campaign.id} adset_id=${adSet.id} ad_id=${ad.id}. Confirm in Ads Manager (filter PAUSED). Budget ${slugBudgetLabel(plan.budgetAmount, plan.currency, plan.budgetType)}; geo “${plan.geo}” → country ${country}.`,
      setupHints: hints,
      present: credStatus.present,
      plan,
      ...withIds(external),
    };
  } catch (err) {
    return {
      status: "error",
      metaCreated: false,
      detail: err instanceof Error ? err.message : "Meta API request failed",
      setupHints: hints,
      present: credStatus.present,
      plan,
      ...withIds(emptyExternal()),
    };
  }
}

/** Pure gate used by tests — approve must be true before publish. */
export function assertMetaLaunchApproved(approved: boolean): void {
  if (!approved) {
    throw new Error("Meta launch requires explicit approval before publish or spend");
  }
}
