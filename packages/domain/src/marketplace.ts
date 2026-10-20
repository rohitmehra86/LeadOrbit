/**
 * Wave 6 — Launch Pack marketplace / industry packs.
 * Catalog is first-party templates; install materializes into an org.
 * Never claims third-party marketplace sync without a live adapter.
 */

import {
  INDUSTRY_TEMPLATES,
  type IndustryTemplateId,
  getIndustryTemplate,
} from "./industry-templates";

export type MarketplacePackStatus = "published" | "scaffold";

export interface MarketplacePack {
  id: string;
  slug: string;
  name: string;
  summary: string;
  industry: IndustryTemplateId | "general";
  /** Default goal text used when installing a Launch Pack. */
  defaultGoal: string;
  defaultLocation: string | null;
  defaultOffer: string | null;
  tags: string[];
  status: MarketplacePackStatus;
  /** Optional industry module entitlement key. */
  requiresFeature: string | null;
}

export interface MarketplaceInstallResult {
  packId: string;
  orgId: string;
  installedAt: string;
  launchPack: {
    campaignId: string;
    formId: string;
    pageId: string;
    pageSlug: string;
    publicPath: string;
    published: boolean;
    name: string;
    goal: string;
  };
  industryTemplateId: IndustryTemplateId | null;
  detail: string;
}

function packFromIndustry(
  id: IndustryTemplateId,
  overrides: Partial<MarketplacePack> & Pick<MarketplacePack, "slug" | "defaultGoal">,
): MarketplacePack {
  const t = getIndustryTemplate(id)!;
  return {
    id: `pack_${overrides.slug}`,
    slug: overrides.slug,
    name: overrides.name ?? `${t.name} Launch Pack`,
    summary: overrides.summary ?? t.description,
    industry: id,
    defaultGoal: overrides.defaultGoal,
    defaultLocation: overrides.defaultLocation ?? null,
    defaultOffer: overrides.defaultOffer ?? null,
    tags: overrides.tags ?? [id, "launch_pack"],
    status: t.status === "ready" ? "published" : "scaffold",
    requiresFeature: t.moduleKey,
  };
}

export const MARKETPLACE_PACKS: readonly MarketplacePack[] = [
  packFromIndustry("real_estate", {
    slug: "real-estate-site-visit",
    name: "Real estate — site visit funnel",
    summary:
      "Capture budget, BHK, and location; publish a site-visit Launch Pack.",
    defaultGoal: "Book site visits for premium apartments",
    defaultLocation: "Bangalore",
    defaultOffer: "Free site visit + brochure pack",
    tags: ["real_estate", "site_visit", "launch_pack"],
  }),
  packFromIndustry("education", {
    slug: "education-admissions",
    name: "Education — admissions inquiry",
    summary: "Scaffold pack for program interest and intake capture.",
    defaultGoal: "Capture admissions inquiries for upcoming intake",
    defaultOffer: "Free counseling session",
    tags: ["education", "admissions", "launch_pack"],
  }),
  packFromIndustry("automotive", {
    slug: "automotive-test-drive",
    name: "Automotive — test drive",
    summary: "Scaffold pack for model interest and test-drive booking.",
    defaultGoal: "Book test drives for new models",
    defaultOffer: "Complimentary test drive this weekend",
    tags: ["automotive", "test_drive", "launch_pack"],
  }),
  packFromIndustry("service_business", {
    slug: "service-quote-request",
    name: "Service business — quote request",
    summary: "Scaffold pack for local service quote requests.",
    defaultGoal: "Collect quote requests for local services",
    defaultOffer: "Same-day quote for urgent jobs",
    tags: ["service_business", "quotes", "launch_pack"],
  }),
  {
    id: "pack_general-lead-gen",
    slug: "general-lead-gen",
    name: "General lead gen",
    summary: "Industry-agnostic Launch Pack — goal → form → public page.",
    industry: "general",
    defaultGoal: "Generate qualified inbound leads",
    defaultLocation: null,
    defaultOffer: "Talk to our team within one business day",
    tags: ["general", "launch_pack"],
    status: "published",
    requiresFeature: null,
  },
] as const;

export function listMarketplacePacks(opts?: {
  includeScaffold?: boolean;
}): MarketplacePack[] {
  const includeScaffold = opts?.includeScaffold ?? true;
  return MARKETPLACE_PACKS.filter(
    (p) => includeScaffold || p.status === "published",
  );
}

export function getMarketplacePack(idOrSlug: string): MarketplacePack | null {
  return (
    MARKETPLACE_PACKS.find(
      (p) => p.id === idOrSlug || p.slug === idOrSlug,
    ) ?? null
  );
}

export function industryTemplateForPack(
  pack: MarketplacePack,
): IndustryTemplateId | null {
  if (pack.industry === "general") return null;
  return pack.industry;
}

/** Sanity: every industry template has at least one marketplace pack. */
export function marketplaceCoverageGaps(): IndustryTemplateId[] {
  const covered = new Set(
    MARKETPLACE_PACKS.map((p) => p.industry).filter(
      (i): i is IndustryTemplateId => i !== "general",
    ),
  );
  return INDUSTRY_TEMPLATES.map((t) => t.id).filter((id) => !covered.has(id));
}
