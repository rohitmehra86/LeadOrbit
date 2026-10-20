/** Milestone 4 — campaigns, forms, landing pages / funnels */

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type CampaignObjective =
  | "lead_gen"
  | "brand_awareness"
  | "traffic"
  | "conversions"
  | "engagement";

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "checkbox"
  | "number"
  | "date"
  | "hidden"
  | "consent";

export type PageBlockType =
  | "hero"
  | "rich_text"
  | "form"
  | "cta"
  | "image"
  | "features"
  | "testimonial"
  | "faq"
  | "consent_notice"
  | "spacer";

export type PublishStatus = "draft" | "published" | "archived";

export type AdNetwork = "meta" | "google_ads";

export type IntegrationConfigStatus =
  | "pending_configuration"
  | "authorized_stub"
  | "connected";

export type AiHookStatus = "unverified" | "ready";

export interface UtmParams {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface CampaignAudience {
  segments: string[];
  territories: string[];
  notes: string;
}

export interface CampaignBudget {
  currency: string;
  dailyCents: number | null;
  totalCents: number | null;
}

export interface CampaignAbVariant {
  id: string;
  name: string;
  weight: number;
  adCopy: string;
}

export interface Campaign {
  id: string;
  orgId: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  audience: CampaignAudience;
  adCopy: string;
  landingPageId: string | null;
  formId: string | null;
  utm: UtmParams;
  budget: CampaignBudget;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  templateKey: string | null;
  abTestEnabled: boolean;
  abVariants: CampaignAbVariant[];
  attributionModel: "last_touch" | "first_touch" | "linear";
  createdAt: string;
  updatedAt: string;
}

export interface CreativeAsset {
  id: string;
  orgId: string;
  name: string;
  contentType: string;
  storagePath: string;
  width: number | null;
  height: number | null;
  tags: string[];
  createdAt: string;
}

export interface FormField {
  id: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
  placeholder: string | null;
  /** Show when another field matches value */
  showWhen: { fieldKey: string; equals: string } | null;
  step: number;
  position: number;
  crmMapTo: "email" | "phone" | "fullName" | "custom" | null;
  customCrmKey: string | null;
}

export interface FormDefinition {
  id: string;
  orgId: string;
  campaignId: string | null;
  name: string;
  status: PublishStatus;
  fields: FormField[];
  multiStep: boolean;
  spamHoneypotEnabled: boolean;
  duplicateDetection: boolean;
  consentText: string | null;
  webhookUrl: string | null;
  embedEnabled: boolean;
  version: number;
  templateKey: string | null;
  thankYouMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  orgId: string;
  formId: string;
  campaignId: string | null;
  leadId: string | null;
  payload: Record<string, unknown>;
  utm: Partial<UtmParams>;
  fingerprint: string;
  duplicateOfId: string | null;
  createdAt: string;
}

/** Safe page document — only known block types; no script execution. */
export interface PageBlock {
  id: string;
  type: PageBlockType;
  props: Record<string, unknown>;
}

export interface PageDocument {
  version: 1;
  blocks: PageBlock[];
  seo: {
    title: string;
    description: string;
    ogImage: string | null;
  };
  consentNotice: string | null;
}

export interface LandingPage {
  id: string;
  orgId: string;
  campaignId: string | null;
  formId: string | null;
  name: string;
  slug: string;
  status: PublishStatus;
  document: PageDocument;
  templateKey: string | null;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageVersion {
  id: string;
  orgId: string;
  pageId: string;
  version: number;
  document: PageDocument;
  createdAt: string;
  note: string | null;
}

export interface FunnelStep {
  id: string;
  kind: "page" | "form" | "thank_you";
  pageId: string | null;
  formId: string | null;
  name: string;
  position: number;
}

export interface Funnel {
  id: string;
  orgId: string;
  campaignId: string | null;
  name: string;
  status: PublishStatus;
  steps: FunnelStep[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketingEvent {
  id: string;
  orgId: string;
  campaignId: string | null;
  pageId: string | null;
  formId: string | null;
  eventType:
    | "page_view"
    | "form_view"
    | "form_submit"
    | "cta_click"
    | "conversion"
    | "ad_spend";
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AdIntegration {
  id: string;
  orgId: string;
  network: AdNetwork;
  status: IntegrationConfigStatus;
  externalAccountId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignPerformance {
  campaignId: string;
  pageViews: number;
  formViews: number;
  formSubmits: number;
  conversions: number;
  ctaClicks: number;
}

export interface AiSuggestionResult {
  status: AiHookStatus;
  provider: string;
  reason: string;
  suggestions: string[];
}

export const ALLOWED_PAGE_BLOCK_TYPES: readonly PageBlockType[] = [
  "hero",
  "rich_text",
  "form",
  "cta",
  "image",
  "features",
  "testimonial",
  "faq",
  "consent_notice",
  "spacer",
] as const;

export function buildUtmParams(input: {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
}): UtmParams {
  return {
    utmSource: slugifyToken(input.source),
    utmMedium: slugifyToken(input.medium),
    utmCampaign: slugifyToken(input.campaign),
    utmTerm: input.term ? slugifyToken(input.term) : undefined,
    utmContent: input.content ? slugifyToken(input.content) : undefined,
  };
}

export function appendUtmToUrl(baseUrl: string, utm: UtmParams): string {
  const url = new URL(baseUrl, "https://leadorbit.local");
  url.searchParams.set("utm_source", utm.utmSource);
  url.searchParams.set("utm_medium", utm.utmMedium);
  url.searchParams.set("utm_campaign", utm.utmCampaign);
  if (utm.utmTerm) url.searchParams.set("utm_term", utm.utmTerm);
  if (utm.utmContent) url.searchParams.set("utm_content", utm.utmContent);
  if (baseUrl.startsWith("http")) return url.toString();
  return `${url.pathname}${url.search}`;
}

export function slugifyToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Strip unknown block types and dangerous keys from page documents. */
export function sanitizePageDocument(raw: unknown): PageDocument {
  const doc = (raw && typeof raw === "object" ? raw : {}) as Partial<PageDocument>;
  const blocksIn = Array.isArray(doc.blocks) ? doc.blocks : [];
  const blocks: PageBlock[] = [];
  for (const b of blocksIn) {
    if (!b || typeof b !== "object") continue;
    const type = (b as PageBlock).type;
    if (!ALLOWED_PAGE_BLOCK_TYPES.includes(type)) continue;
    const props = sanitizeProps((b as PageBlock).props ?? {});
    blocks.push({
      id: String((b as PageBlock).id || cryptoRandomId()),
      type,
      props,
    });
  }
  const seoIn = doc.seo && typeof doc.seo === "object" ? doc.seo : {};
  return {
    version: 1,
    blocks,
    seo: {
      title: String((seoIn as PageDocument["seo"]).title || "Untitled page"),
      description: String((seoIn as PageDocument["seo"]).description || ""),
      ogImage: (seoIn as PageDocument["seo"]).ogImage
        ? String((seoIn as PageDocument["seo"]).ogImage)
        : null,
    },
    consentNotice: doc.consentNotice ? String(doc.consentNotice) : null,
  };
}

function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "html" || k === "script" || k === "dangerouslySetInnerHTML") continue;
    if (typeof v === "string") {
      out[k] = v.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
      continue;
    }
    if (
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null ||
      Array.isArray(v)
    ) {
      out[k] = v;
      continue;
    }
    if (typeof v === "object") {
      out[k] = sanitizeProps(v as Record<string, unknown>);
    }
  }
  return out;
}

function cryptoRandomId(): string {
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

export function submissionFingerprint(
  formId: string,
  payload: Record<string, unknown>,
): string {
  const email = String(payload.email ?? payload.Email ?? "")
    .toLowerCase()
    .trim();
  const phone = String(payload.phone ?? payload.Phone ?? "").replace(/\D/g, "");
  return `${formId}:${email}:${phone}`;
}

export function visibleFieldsForStep(
  fields: FormField[],
  values: Record<string, unknown>,
  step: number,
): FormField[] {
  return fields
    .filter((f) => f.step === step)
    .filter((f) => {
      if (!f.showWhen) return true;
      return String(values[f.showWhen.fieldKey] ?? "") === f.showWhen.equals;
    })
    .sort((a, b) => a.position - b.position);
}

export function validateFormPayload(
  form: FormDefinition,
  payload: Record<string, unknown>,
  honeypotValue?: string,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (form.spamHoneypotEnabled && honeypotValue && honeypotValue.trim()) {
    return { ok: false, errors: ["Spam detected"] };
  }
  for (const field of form.fields) {
    if (field.type === "hidden") continue;
    if (field.showWhen) {
      if (String(payload[field.showWhen.fieldKey] ?? "") !== field.showWhen.equals) {
        continue;
      }
    }
    const raw = payload[field.key];
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === "string" && raw.trim() === "");
    if (field.required && empty) {
      errors.push(`${field.label} is required`);
      continue;
    }
    if (empty) continue;
    if (field.type === "email" && typeof raw === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        errors.push(`${field.label} must be a valid email`);
      }
    }
    if (field.type === "consent" && field.required && raw !== true && raw !== "true") {
      errors.push(`${field.label} must be accepted`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function aiCopySuggestionHook(env: {
  llmApiKey?: string | null;
  prompt: string;
}): AiSuggestionResult {
  if (!env.llmApiKey) {
    return {
      status: "unverified",
      provider: "none",
      reason: "LLM_API_KEY not configured — AI suggestions unavailable",
      suggestions: [],
    };
  }
  // Provider-agnostic hook: key present but no live call wired yet.
  return {
    status: "unverified",
    provider: "generic",
    reason: "LLM key present but provider adapter not verified in this environment",
    suggestions: [
      `Draft for: ${env.prompt.slice(0, 80)}`,
      "Follow up with a clear CTA and social proof.",
    ],
  };
}

export function adNetworkAuthorizeStub(
  network: AdNetwork,
  credentialsPresent: boolean,
): { status: IntegrationConfigStatus; detail: string } {
  if (!credentialsPresent) {
    return {
      status: "pending_configuration",
      detail: `${network} credentials missing — authorize flow stub only`,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${network} OAuth stub accepted locally; live ad network sync not claimed`,
  };
}

export function realEstateLandingTemplate(): PageDocument {
  return sanitizePageDocument({
    version: 1,
    seo: {
      title: "Find your next home",
      description: "Browse listings and book a private tour.",
      ogImage: null,
    },
    consentNotice:
      "By submitting, you agree to be contacted about properties. You can unsubscribe anytime.",
    blocks: [
      {
        id: "hero1",
        type: "hero",
        props: {
          headline: "Homes that fit your life",
          subheadline: "Local agents. Verified listings. Instant tour booking.",
          ctaLabel: "Get matched",
        },
      },
      {
        id: "feat1",
        type: "features",
        props: {
          items: [
            "Neighborhood insights",
            "Mortgage pre-check",
            "Same-day tours",
          ],
        },
      },
      {
        id: "form1",
        type: "form",
        props: { heading: "Tell us what you need" },
      },
      {
        id: "consent1",
        type: "consent_notice",
        props: {
          text: "We respect your privacy and never sell your contact details.",
        },
      },
    ],
  });
}

export function leadGenFormTemplate(): FormField[] {
  return [
    {
      id: "f1",
      key: "fullName",
      label: "Full name",
      type: "text",
      required: true,
      options: [],
      placeholder: "Jordan Lee",
      showWhen: null,
      step: 0,
      position: 0,
      crmMapTo: "fullName",
      customCrmKey: null,
    },
    {
      id: "f2",
      key: "email",
      label: "Work email",
      type: "email",
      required: true,
      options: [],
      placeholder: "you@company.com",
      showWhen: null,
      step: 0,
      position: 1,
      crmMapTo: "email",
      customCrmKey: null,
    },
    {
      id: "f3",
      key: "phone",
      label: "Phone",
      type: "phone",
      required: false,
      options: [],
      placeholder: "+1…",
      showWhen: null,
      step: 0,
      position: 2,
      crmMapTo: "phone",
      customCrmKey: null,
    },
    {
      id: "f4",
      key: "budget",
      label: "Budget range",
      type: "select",
      required: false,
      options: ["Under $500k", "$500k–$1M", "$1M+"],
      placeholder: null,
      showWhen: null,
      step: 1,
      position: 0,
      crmMapTo: "custom",
      customCrmKey: "budget",
    },
    {
      id: "f5",
      key: "consent",
      label: "I agree to be contacted",
      type: "consent",
      required: true,
      options: [],
      placeholder: null,
      showWhen: null,
      step: 1,
      position: 1,
      crmMapTo: null,
      customCrmKey: null,
    },
  ];
}

export function aggregatePerformance(
  events: Array<{ eventType: MarketingEvent["eventType"] }>,
): Omit<CampaignPerformance, "campaignId"> {
  const counts = {
    pageViews: 0,
    formViews: 0,
    formSubmits: 0,
    conversions: 0,
    ctaClicks: 0,
  };
  for (const e of events) {
    if (e.eventType === "page_view") counts.pageViews += 1;
    if (e.eventType === "form_view") counts.formViews += 1;
    if (e.eventType === "form_submit") counts.formSubmits += 1;
    if (e.eventType === "conversion") counts.conversions += 1;
    if (e.eventType === "cta_click") counts.ctaClicks += 1;
  }
  return counts;
}
