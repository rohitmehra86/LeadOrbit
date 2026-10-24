/**
 * Meta OUTCOME_LEADS ad set / creative configuration (Marketing API v21+).
 * Pure helpers — no network I/O.
 */

import type { MetaLaunchPlan } from "./meta-ads";

export type MetaLeadDestination = "website" | "instant_form";

export type MetaLeadAssets = {
  pageId: string;
  pixelId?: string | null;
  leadGenFormId?: string | null;
};

export type MetaLeadPublishValidation =
  | {
      ok: true;
      destination: MetaLeadDestination;
      setupHints: string[];
    }
  | {
      ok: false;
      detail: string;
      setupHints: string[];
    };

export function inferMetaLeadDestination(
  plan: MetaLaunchPlan,
  assets: Pick<MetaLeadAssets, "leadGenFormId">,
): MetaLeadDestination {
  if (assets.leadGenFormId?.trim() || plan.leadGenFormId?.trim()) {
    return "instant_form";
  }
  if (plan.landingPageUrl?.trim()) {
    return "website";
  }
  return "instant_form";
}

export function validateMetaLeadPublishConfig(
  plan: MetaLaunchPlan,
  assets: MetaLeadAssets,
): MetaLeadPublishValidation {
  const hints = [
    "Website leads: set META_ADS_PIXEL_ID (Events Manager) on Vercel — required with landingPageUrl",
    "Instant Form leads: set META_ADS_LEAD_GEN_FORM_ID or plan.leadGenFormId (create form on Page first)",
    "Ad set needs destination_type + promoted_object matching OUTCOME_LEADS + LEAD_GENERATION",
    "Connect Meta must use the same Page ID as META_ADS_PAGE_ID / org connection",
  ];

  if (!assets.pageId?.trim()) {
    return {
      ok: false,
      detail: "Meta create blocked — Facebook Page ID missing (Connect Meta or META_ADS_PAGE_ID)",
      setupHints: hints,
    };
  }

  const destination = inferMetaLeadDestination(plan, assets);

  if (destination === "website") {
    if (!plan.landingPageUrl?.trim()) {
      return {
        ok: false,
        detail:
          "Meta create blocked — landingPageUrl required for website lead ads",
        setupHints: hints,
      };
    }
    if (!assets.pixelId?.trim()) {
      return {
        ok: false,
        detail:
          "Meta create blocked — META_ADS_PIXEL_ID required for OUTCOME_LEADS website destination (Events Manager → Pixel → copy ID). No Pixel ID is invented.",
        setupHints: hints,
      };
    }
    return { ok: true, destination, setupHints: hints };
  }

  const formId =
    assets.leadGenFormId?.trim() || plan.leadGenFormId?.trim() || null;
  if (!formId) {
    return {
      ok: false,
      detail:
        "Meta create blocked — instant Form lead ads need META_ADS_LEAD_GEN_FORM_ID or plan.leadGenFormId (create lead form on the Page in Meta first)",
      setupHints: hints,
    };
  }
  return { ok: true, destination, setupHints: hints };
}

export type MetaLeadAdSetInput = {
  name: string;
  campaignId: string;
  countryCode: string;
  status: "PAUSED" | "ACTIVE";
  dailyBudgetMinor?: number;
  lifetimeBudgetMinor?: number;
  destination: MetaLeadDestination;
  pageId: string;
  pixelId?: string | null;
};

/** Ad set body for POST act_…/adsets — includes promoted_object Meta requires before ad create. */
export function buildMetaLeadAdSetBody(
  input: MetaLeadAdSetInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignId,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: input.status,
    targeting: {
      geo_locations: { countries: [input.countryCode] },
    },
  };
  if (input.dailyBudgetMinor) body.daily_budget = input.dailyBudgetMinor;
  if (input.lifetimeBudgetMinor) body.lifetime_budget = input.lifetimeBudgetMinor;

  if (input.destination === "website") {
    body.destination_type = "WEBSITE";
    body.promoted_object = {
      page_id: input.pageId,
      pixel_id: input.pixelId,
      custom_event_type: "LEAD",
    };
  } else {
    body.destination_type = "ON_AD";
    body.promoted_object = {
      page_id: input.pageId,
    };
  }
  return body;
}

export function buildMetaWebsiteLeadCreativeBody(
  plan: MetaLaunchPlan,
  pageId: string,
): Record<string, unknown> {
  const link = plan.landingPageUrl!.trim();
  return {
    name: `${plan.name} — Creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: plan.primaryText,
        link,
        name: plan.headline,
        call_to_action: {
          type: plan.callToAction,
          value: { link },
        },
        ...(plan.creativeImageUrl ? { picture: plan.creativeImageUrl } : {}),
      },
    },
  };
}

export function buildMetaInstantFormLeadCreativeBody(
  plan: MetaLaunchPlan,
  pageId: string,
  leadGenFormId: string,
): Record<string, unknown> {
  return {
    name: `${plan.name} — Creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: plan.primaryText,
        link: "https://fb.me/",
        name: plan.headline,
        description: plan.headline,
        call_to_action: {
          type: plan.callToAction,
          value: { lead_gen_form_id: leadGenFormId },
        },
        ...(plan.creativeImageUrl ? { picture: plan.creativeImageUrl } : {}),
      },
    },
  };
}
