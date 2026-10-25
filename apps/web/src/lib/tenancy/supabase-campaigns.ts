import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthError, isSupabaseConfigured, type SessionUser } from "@leadorbit/db";
import {
  aggregatePerformance,
  aiCopySuggestionHook,
  buildUtmParams,
  leadGenFormTemplate,
  sanitizePageDocument,
  type Campaign,
  type CreativeAsset,
  type FormDefinition,
  type FormField,
  type FormSubmission,
  type Funnel,
  type FunnelStep,
  type LandingPage,
  type MarketingEvent,
  type PageDocument,
  type PublishStatus,
  type UtmParams,
} from "@leadorbit/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPublicRecordId } from "@/lib/tenancy/public-record-id";

function mapFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const fields: FormField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const field = item as Partial<FormField>;
    fields.push({
      id: String(field.id ?? ""),
      key: String(field.key ?? ""),
      label: String(field.label ?? ""),
      type: (field.type ?? "text") as FormField["type"],
      required: Boolean(field.required),
      options: Array.isArray(field.options) ? field.options.map(String) : [],
      placeholder: field.placeholder ? String(field.placeholder) : null,
      showWhen:
        field.showWhen && typeof field.showWhen === "object"
          ? {
              fieldKey: String(field.showWhen.fieldKey ?? ""),
              equals: String(field.showWhen.equals ?? ""),
            }
          : null,
      step: Number(field.step ?? 0),
      position: Number(field.position ?? 0),
      crmMapTo: field.crmMapTo ?? null,
      customCrmKey: field.customCrmKey ? String(field.customCrmKey) : null,
    });
  }
  return fields;
}

function anonClient() {
  if (!isSupabaseConfigured()) {
    throw new AuthError("Supabase is not configured", "validation");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function authed() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    objective: row.objective as Campaign["objective"],
    status: row.status as Campaign["status"],
    audience: (row.audience as Campaign["audience"]) ?? {
      segments: [],
      territories: [],
      notes: "",
    },
    adCopy: String(row.ad_copy ?? ""),
    landingPageId: (row.landing_page_id as string | null) ?? null,
    formId: (row.form_id as string | null) ?? null,
    utm: (row.utm as UtmParams) ?? { utmSource: "", utmMedium: "", utmCampaign: "" },
    budget: (row.budget as Campaign["budget"]) ?? {
      currency: "USD",
      dailyCents: null,
      totalCents: null,
    },
    scheduleStart: (row.schedule_start as string | null) ?? null,
    scheduleEnd: (row.schedule_end as string | null) ?? null,
    templateKey: (row.template_key as string | null) ?? null,
    abTestEnabled: Boolean(row.ab_test_enabled),
    abVariants: (row.ab_variants as Campaign["abVariants"]) ?? [],
    attributionModel: (row.attribution_model as Campaign["attributionModel"]) ?? "last_touch",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapForm(row: Record<string, unknown>): FormDefinition {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    campaignId: (row.campaign_id as string | null) ?? null,
    name: String(row.name),
    status: row.status as PublishStatus,
    fields: mapFields(row.fields),
    multiStep: Boolean(row.multi_step),
    spamHoneypotEnabled: Boolean(row.spam_honeypot_enabled),
    duplicateDetection: Boolean(row.duplicate_detection),
    consentText: (row.consent_text as string | null) ?? null,
    webhookUrl: (row.webhook_url as string | null) ?? null,
    embedEnabled: Boolean(row.embed_enabled),
    version: Number(row.version ?? 1),
    templateKey: (row.template_key as string | null) ?? null,
    thankYouMessage: String(row.thank_you_message ?? "Thank you"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPage(row: Record<string, unknown>): LandingPage {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    campaignId: (row.campaign_id as string | null) ?? null,
    formId: (row.form_id as string | null) ?? null,
    name: String(row.name),
    slug: String(row.slug),
    status: row.status as PublishStatus,
    document: sanitizePageDocument(row.document),
    templateKey: (row.template_key as string | null) ?? null,
    version: Number(row.version ?? 1),
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Published rows are world-readable. Anon SELECT can still fail when a member
 * policy calls private.is_org_member, which anon cannot execute. Retry with
 * the service role, still filtered to status=published.
 */
async function selectPublishedRow(
  table: "landing_pages" | "forms",
  filters: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const run = async (client: SupabaseClient) => {
    let query = client.from(table).select("*").eq("status", "published");
    for (const [column, value] of Object.entries(filters)) {
      query = query.eq(column, value);
    }
    return query.maybeSingle();
  };

  const anon = anonClient();
  const first = await run(anon);
  if (!first.error) {
    return (first.data as Record<string, unknown> | null) ?? null;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) throw new AuthError(first.error.message, "validation");
  const second = await run(admin);
  if (second.error) throw new AuthError(second.error.message, "validation");
  return (second.data as Record<string, unknown> | null) ?? null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/** Durable campaigns/forms/pages for AUTH_MODE=supabase. */
export class SupabaseCampaignStore {
  async listCampaigns(_actor: SessionUser, orgId: string): Promise<Campaign[]> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map(mapCampaign);
  }

  async getCampaign(
    _actor: SessionUser,
    orgId: string,
    campaignId: string,
  ): Promise<Campaign | null> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", campaignId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    return data ? mapCampaign(data as Record<string, unknown>) : null;
  }

  async createCampaign(
    _actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      objective?: Campaign["objective"];
      adCopy?: string;
      status?: Campaign["status"];
      audience?: Campaign["audience"];
      budget?: Campaign["budget"];
      utmSource?: string;
      utmMedium?: string;
    },
  ): Promise<Campaign> {
    const supabase = await authed();
    const utm = buildUtmParams({
      source: input.utmSource ?? "leadorbit",
      medium: input.utmMedium ?? "campaign",
      campaign: input.name,
    });
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        objective: input.objective ?? "lead_gen",
        status: input.status ?? "draft",
        audience: input.audience ?? { segments: [], territories: [], notes: "" },
        ad_copy: input.adCopy ?? "",
        utm,
        budget: input.budget ?? { currency: "USD", dailyCents: null, totalCents: null },
        attribution_model: "last_touch",
        ab_test_enabled: false,
        ab_variants: [],
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapCampaign(data as Record<string, unknown>);
  }

  async updateCampaign(
    actor: SessionUser,
    orgId: string,
    campaignId: string,
    patch: Partial<{
      formId: string | null;
      landingPageId: string | null;
      status: Campaign["status"];
      adCopy: string;
    }>,
  ): Promise<Campaign> {
    const supabase = await authed();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.formId !== undefined) updates.form_id = patch.formId;
    if (patch.landingPageId !== undefined) updates.landing_page_id = patch.landingPageId;
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.adCopy !== undefined) updates.ad_copy = patch.adCopy;
    const { data, error } = await supabase
      .from("campaigns")
      .update(updates)
      .eq("org_id", orgId)
      .eq("id", campaignId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    void actor;
    return mapCampaign(data as Record<string, unknown>);
  }

  async createForm(
    _actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      campaignId?: string | null;
      templateKey?: string | null;
      consentText?: string | null;
    },
  ): Promise<FormDefinition> {
    const supabase = await authed();
    const fields = leadGenFormTemplate();
    const { data, error } = await supabase
      .from("forms")
      .insert({
        org_id: orgId,
        campaign_id: input.campaignId ?? null,
        name: input.name.trim(),
        status: "draft",
        fields,
        multi_step: true,
        spam_honeypot_enabled: true,
        duplicate_detection: true,
        consent_text: input.consentText ?? "I agree to be contacted about this offer.",
        embed_enabled: true,
        version: 1,
        template_key: input.templateKey ?? "lead_gen",
        thank_you_message: "Thanks \u2014 we will be in touch shortly.",
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapForm(data as Record<string, unknown>);
  }

  async getForm(
    _actor: SessionUser,
    orgId: string,
    formId: string,
  ): Promise<FormDefinition | null> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("forms")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", formId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    return data ? mapForm(data as Record<string, unknown>) : null;
  }

  getPublishedForm(orgId: string, formId: string): FormDefinition | null {
    // Sync API surface for local parity \u2014 prefer async path in supabase mode.
    void orgId;
    void formId;
    return null;
  }

  async getPublishedFormAsync(
    orgId: string,
    formId: string,
  ): Promise<FormDefinition | null> {
    if (!isPublicRecordId(orgId) || !isPublicRecordId(formId)) return null;
    const data = await selectPublishedRow("forms", {
      org_id: orgId,
      id: formId,
    });
    return data ? mapForm(data) : null;
  }

  async updateForm(
    _actor: SessionUser,
    orgId: string,
    formId: string,
    patch: Partial<{ status: PublishStatus; name: string }>,
  ): Promise<FormDefinition> {
    const supabase = await authed();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status) updates.status = patch.status;
    if (patch.name) updates.name = patch.name;
    const { data, error } = await supabase
      .from("forms")
      .update(updates)
      .eq("org_id", orgId)
      .eq("id", formId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapForm(data as Record<string, unknown>);
  }

  async createPage(
    _actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      slug?: string;
      campaignId?: string | null;
      formId?: string | null;
      templateKey?: string | null;
      document?: PageDocument;
    },
  ): Promise<LandingPage> {
    const supabase = await authed();
    const slug =
      slugify(input.slug ?? input.name) || `page-${Math.random().toString(36).slice(2, 8)}`;
    const document =
      input.document ??
      sanitizePageDocument({
        version: 1,
        seo: { title: input.name, description: "", ogImage: null },
        consentNotice: "By continuing you agree to our privacy notice.",
        blocks: [
          {
            id: "hero",
            type: "hero",
            props: {
              headline: input.name,
              subheadline: "Capture demand with LeadOrbit.",
              ctaLabel: "Get started",
            },
          },
          { id: "form", type: "form", props: { heading: "Contact us" } },
        ],
      });
    const { data, error } = await supabase
      .from("landing_pages")
      .insert({
        org_id: orgId,
        campaign_id: input.campaignId ?? null,
        form_id: input.formId ?? null,
        name: input.name.trim(),
        slug,
        status: "draft",
        document,
        template_key: input.templateKey ?? null,
        version: 1,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new AuthError("Slug already exists", "conflict");
      throw new AuthError(error.message, "validation");
    }
    return mapPage(data as Record<string, unknown>);
  }

  async listPages(_actor: SessionUser, orgId: string): Promise<LandingPage[]> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("landing_pages")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map(mapPage);
  }

  async getPage(
    _actor: SessionUser,
    orgId: string,
    pageId: string,
  ): Promise<LandingPage | null> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("landing_pages")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", pageId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    return data ? mapPage(data as Record<string, unknown>) : null;
  }

  getPublishedPageBySlug(orgId: string, slug: string): LandingPage | null {
    void orgId;
    void slug;
    return null;
  }

  async getPublishedPageBySlugAsync(
    orgId: string,
    slug: string,
  ): Promise<LandingPage | null> {
    if (!isPublicRecordId(orgId) || !slug.trim()) return null;
    const data = await selectPublishedRow("landing_pages", {
      org_id: orgId,
      slug,
    });
    return data ? mapPage(data) : null;
  }

  async publishPage(
    actor: SessionUser,
    orgId: string,
    pageId: string,
  ): Promise<LandingPage> {
    const supabase = await authed();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("landing_pages")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("org_id", orgId)
      .eq("id", pageId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    void actor;
    return mapPage(data as Record<string, unknown>);
  }

  async submitFormPublic(input: {
    orgId: string;
    formId: string;
    payload: Record<string, unknown>;
    honeypot?: string;
    utm?: Partial<UtmParams>;
    campaignId?: string | null;
  }): Promise<FormSubmission> {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("submit_public_form", {
      p_org_id: input.orgId,
      p_form_id: input.formId,
      p_payload: input.payload,
      p_utm: input.utm ?? {},
      p_campaign_id: input.campaignId ?? null,
      p_honeypot: input.honeypot ?? null,
    });
    if (error) throw new AuthError(error.message, "validation");
    const result = data as {
      submissionId: string;
      leadId: string | null;
      campaignId: string | null;
      duplicateOfId: string | null;
      formId: string;
    };
    return {
      id: result.submissionId,
      orgId: input.orgId,
      formId: result.formId,
      campaignId: result.campaignId,
      leadId: result.leadId,
      payload: input.payload,
      utm: {
        utmSource: String(input.utm?.utmSource ?? ""),
        utmMedium: String(input.utm?.utmMedium ?? ""),
        utmCampaign: String(input.utm?.utmCampaign ?? ""),
      },
      fingerprint: "",
      duplicateOfId: result.duplicateOfId,
      createdAt: new Date().toISOString(),
    };
  }

  async listForms(_actor: SessionUser, orgId: string): Promise<FormDefinition[]> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("forms")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map(mapForm);
  }

  async listSubmissions(
    _actor: SessionUser,
    orgId: string,
    formId: string,
  ): Promise<FormSubmission[]> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("form_submissions")
      .select("*")
      .eq("org_id", orgId)
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      formId: String(r.form_id),
      campaignId: (r.campaign_id as string | null) ?? null,
      leadId: (r.lead_id as string | null) ?? null,
      payload: (r.payload as Record<string, unknown>) ?? {},
      utm: (r.utm as UtmParams) ?? { utmSource: "", utmMedium: "", utmCampaign: "" },
      fingerprint: String(r.fingerprint ?? ""),
      duplicateOfId: (r.duplicate_of_id as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
  }

  async listCreatives(_actor: SessionUser, orgId: string): Promise<CreativeAsset[]> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      contentType: String(r.content_type),
      storagePath: String(r.storage_path),
      width: r.width == null ? null : Number(r.width),
      height: r.height == null ? null : Number(r.height),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      createdAt: String(r.created_at),
    }));
  }

  async createCreative(
    _actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      contentType: string;
      storagePath: string;
      width?: number | null;
      height?: number | null;
      tags?: string[];
    },
  ): Promise<CreativeAsset> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("creative_assets")
      .insert({
        org_id: orgId,
        name: input.name,
        content_type: input.contentType,
        storage_path: input.storagePath,
        width: input.width ?? null,
        height: input.height ?? null,
        tags: input.tags ?? [],
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      contentType: String(r.content_type),
      storagePath: String(r.storage_path),
      width: r.width == null ? null : Number(r.width),
      height: r.height == null ? null : Number(r.height),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      createdAt: String(r.created_at),
    };
  }

  async listFunnels(_actor: SessionUser, orgId: string): Promise<Funnel[]> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("funnels")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      campaignId: (r.campaign_id as string | null) ?? null,
      name: String(r.name),
      status: r.status as PublishStatus,
      steps: (r.steps as FunnelStep[]) ?? [],
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createFunnel(
    _actor: SessionUser,
    orgId: string,
    input: { name: string; campaignId?: string | null; steps?: FunnelStep[] },
  ): Promise<Funnel> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("funnels")
      .insert({
        org_id: orgId,
        campaign_id: input.campaignId ?? null,
        name: input.name.trim(),
        status: "draft",
        steps: input.steps ?? [],
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      campaignId: (r.campaign_id as string | null) ?? null,
      name: String(r.name),
      status: r.status as PublishStatus,
      steps: (r.steps as FunnelStep[]) ?? [],
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async updatePage(
    _actor: SessionUser,
    orgId: string,
    pageId: string,
    patch: Partial<{
      name: string;
      slug: string;
      formId: string | null;
      document: PageDocument;
      status: PublishStatus;
    }>,
  ): Promise<LandingPage> {
    const supabase = await authed();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.slug !== undefined) updates.slug = slugify(patch.slug);
    if (patch.formId !== undefined) updates.form_id = patch.formId;
    if (patch.document !== undefined) updates.document = sanitizePageDocument(patch.document);
    if (patch.status !== undefined) {
      updates.status = patch.status;
      if (patch.status === "published") updates.published_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from("landing_pages")
      .update(updates)
      .eq("org_id", orgId)
      .eq("id", pageId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapPage(data as Record<string, unknown>);
  }

  async listPageVersions(_actor: SessionUser, orgId: string, pageId: string) {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("page_versions")
      .select("*")
      .eq("org_id", orgId)
      .eq("page_id", pageId)
      .order("version", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      pageId: String(r.page_id),
      version: Number(r.version),
      document: sanitizePageDocument(r.document),
      createdAt: String(r.created_at),
      note: r.note ? String(r.note) : null,
    }));
  }

  async campaignPerformance(
    _actor: SessionUser,
    orgId: string,
    campaignId: string,
  ) {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("marketing_events")
      .select("event_type")
      .eq("org_id", orgId)
      .eq("campaign_id", campaignId);
    if (error) throw new AuthError(error.message, "validation");
    const rows = ((data ?? []) as Array<{ event_type: MarketingEvent["eventType"] }>).map(
      (r) => ({ eventType: r.event_type }),
    );
    return { campaignId, ...aggregatePerformance(rows) };
  }

  suggestCopy(prompt: string) {
    return aiCopySuggestionHook({
      prompt,
      llmApiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? null,
    });
  }

  async trackEvent(
    _actor: SessionUser,
    orgId: string,
    input: {
      campaignId?: string | null;
      pageId?: string | null;
      formId?: string | null;
      eventType: MarketingEvent["eventType"];
      meta?: Record<string, unknown>;
    },
  ): Promise<MarketingEvent> {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("marketing_events")
      .insert({
        org_id: orgId,
        campaign_id: input.campaignId ?? null,
        page_id: input.pageId ?? null,
        form_id: input.formId ?? null,
        event_type: input.eventType,
        meta: input.meta ?? {},
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      campaignId: (r.campaign_id as string | null) ?? null,
      pageId: (r.page_id as string | null) ?? null,
      formId: (r.form_id as string | null) ?? null,
      eventType: r.event_type as MarketingEvent["eventType"],
      meta: (r.meta as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    };
  }

  async listAdIntegrations(_actor: SessionUser, orgId: string) {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("ad_integrations")
      .select("*")
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      network: r.network as import("@leadorbit/domain").AdNetwork,
      status: r.status as import("@leadorbit/domain").IntegrationConfigStatus,
      externalAccountId: (r.external_account_id as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async authorizeAdNetwork(
    _actor: SessionUser,
    orgId: string,
    network: import("@leadorbit/domain").AdNetwork,
  ) {
    const { adNetworkAuthorizeStub, metaAdsReadyForCreate } = await import(
      "@leadorbit/domain"
    );
    const creds =
      network === "meta"
        ? Boolean(process.env.META_ADS_APP_ID && process.env.META_ADS_APP_SECRET) ||
          metaAdsReadyForCreate()
        : Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
    const stub = adNetworkAuthorizeStub(network, creds);
    const supabase = await authed();
    const { data, error } = await supabase
      .from("ad_integrations")
      .upsert(
        {
          org_id: orgId,
          network,
          status: stub.status,
          last_error: stub.detail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,network" },
      )
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      network: r.network as import("@leadorbit/domain").AdNetwork,
      status: r.status as import("@leadorbit/domain").IntegrationConfigStatus,
      externalAccountId: (r.external_account_id as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listMarketingEvents(_actor: SessionUser, orgId: string) {
    const supabase = await authed();
    const { data, error } = await supabase
      .from("marketing_events")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      campaignId: (r.campaign_id as string | null) ?? null,
      pageId: (r.page_id as string | null) ?? null,
      formId: (r.form_id as string | null) ?? null,
      eventType: r.event_type as MarketingEvent["eventType"],
      meta: (r.meta as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
  }

  async duplicateForm(): Promise<never> {
    throw new AuthError("duplicateForm not yet ported on Supabase adapter", "validation");
  }

  async duplicatePage(): Promise<never> {
    throw new AuthError("duplicatePage not yet ported on Supabase adapter", "validation");
  }

  async duplicateCampaign(): Promise<never> {
    throw new AuthError("duplicateCampaign not yet ported on Supabase adapter", "validation");
  }

  setCrmStore(_crm: unknown): void {
    // no-op
  }
}

let singleton: SupabaseCampaignStore | null = null;
export function getSupabaseCampaignStore(): SupabaseCampaignStore {
  if (!singleton) singleton = new SupabaseCampaignStore();
  return singleton;
}
