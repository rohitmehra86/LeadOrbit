import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  adNetworkAuthorizeStub,
  aggregatePerformance,
  aiCopySuggestionHook,
  buildUtmParams,
  hasPermission,
  leadGenFormTemplate,
  metaAdsReadyForCreate,
  realEstateLandingTemplate,
  sanitizePageDocument,
  slugifyToken,
  submissionFingerprint,
  validateFormPayload,
  type AdIntegration,
  type AdNetwork,
  type Campaign,
  type CampaignObjective,
  type CampaignPerformance,
  type CampaignStatus,
  type CreativeAsset,
  type FormDefinition,
  type FormField,
  type FormSubmission,
  type Funnel,
  type FunnelStep,
  type LandingPage,
  type MarketingEvent,
  type PageDocument,
  type PageVersion,
  type PublishStatus,
  type UtmParams,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import type { CrmStore } from "./crm-store";

function nowIso(): string {
  return new Date().toISOString();
}

function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type MarketingPerm =
  | "campaigns:read"
  | "campaigns:write"
  | "forms:read"
  | "forms:write"
  | "pages:read"
  | "pages:write";

export class CampaignStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private crm: CrmStore | null = null,
  ) {}

  setCrmStore(crm: CrmStore): void {
    this.crm = crm;
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: MarketingPerm,
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private mapCampaign(row: Record<string, unknown>): Campaign {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      name: String(row.name),
      objective: row.objective as Campaign["objective"],
      status: row.status as CampaignStatus,
      audience: jparse(String(row.audience), {
        segments: [],
        territories: [],
        notes: "",
      }),
      adCopy: String(row.ad_copy ?? ""),
      landingPageId: row.landing_page_id ? String(row.landing_page_id) : null,
      formId: row.form_id ? String(row.form_id) : null,
      utm: jparse(String(row.utm), {
        utmSource: "direct",
        utmMedium: "none",
        utmCampaign: "campaign",
      }),
      budget: jparse(String(row.budget), {
        currency: "USD",
        dailyCents: null,
        totalCents: null,
      }),
      scheduleStart: row.schedule_start ? String(row.schedule_start) : null,
      scheduleEnd: row.schedule_end ? String(row.schedule_end) : null,
      templateKey: row.template_key ? String(row.template_key) : null,
      abTestEnabled: Boolean(row.ab_test_enabled),
      abVariants: jparse(String(row.ab_variants), []),
      attributionModel: (row.attribution_model as Campaign["attributionModel"]) ?? "last_touch",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapForm(row: Record<string, unknown>): FormDefinition {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      name: String(row.name),
      status: row.status as PublishStatus,
      fields: jparse(String(row.fields), []),
      multiStep: Boolean(row.multi_step),
      spamHoneypotEnabled: Boolean(row.spam_honeypot_enabled),
      duplicateDetection: Boolean(row.duplicate_detection),
      consentText: row.consent_text ? String(row.consent_text) : null,
      webhookUrl: row.webhook_url ? String(row.webhook_url) : null,
      embedEnabled: Boolean(row.embed_enabled),
      version: Number(row.version),
      templateKey: row.template_key ? String(row.template_key) : null,
      thankYouMessage: String(row.thank_you_message ?? "Thank you"),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapPage(row: Record<string, unknown>): LandingPage {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      formId: row.form_id ? String(row.form_id) : null,
      name: String(row.name),
      slug: String(row.slug),
      status: row.status as PublishStatus,
      document: sanitizePageDocument(jparse(String(row.document), {})),
      templateKey: row.template_key ? String(row.template_key) : null,
      version: Number(row.version),
      publishedAt: row.published_at ? String(row.published_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listCampaigns(actor: SessionUser, orgId: string): Promise<Campaign[]> {
    await this.gate(actor, orgId, "campaigns:read");
    const rows = this.db
      .prepare(`select * from campaigns where org_id = ? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapCampaign(r));
  }

  async createCampaign(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      objective?: CampaignObjective;
      adCopy?: string;
      templateKey?: string;
      status?: CampaignStatus;
      scheduleStart?: string | null;
      scheduleEnd?: string | null;
      budget?: Campaign["budget"];
      audience?: Campaign["audience"];
      abTestEnabled?: boolean;
      abVariants?: Campaign["abVariants"];
      attributionModel?: Campaign["attributionModel"];
      utmSource?: string;
      utmMedium?: string;
    },
  ): Promise<Campaign> {
    await this.gate(actor, orgId, "campaigns:write");
    const id = randomUUID();
    const now = nowIso();
    const utm = buildUtmParams({
      source: input.utmSource ?? "leadorbit",
      medium: input.utmMedium ?? "campaign",
      campaign: input.name,
    });
    const audience = input.audience ?? { segments: [], territories: [], notes: "" };
    const budget = input.budget ?? {
      currency: "USD",
      dailyCents: null,
      totalCents: null,
    };
    this.db
      .prepare(
        `insert into campaigns(
          id, org_id, name, objective, status, audience, ad_copy, landing_page_id, form_id,
          utm, budget, schedule_start, schedule_end, template_key, ab_test_enabled, ab_variants,
          attribution_model, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.objective ?? "lead_gen",
        input.status ?? "draft",
        JSON.stringify(audience),
        input.adCopy ?? "",
        null,
        null,
        JSON.stringify(utm),
        JSON.stringify(budget),
        input.scheduleStart ?? null,
        input.scheduleEnd ?? null,
        input.templateKey ?? null,
        input.abTestEnabled ? 1 : 0,
        JSON.stringify(input.abVariants ?? []),
        input.attributionModel ?? "last_touch",
        now,
        now,
      );
    return (await this.getCampaign(actor, orgId, id))!;
  }

  async getCampaign(
    actor: SessionUser,
    orgId: string,
    campaignId: string,
  ): Promise<Campaign | null> {
    await this.gate(actor, orgId, "campaigns:read");
    const row = this.db
      .prepare(`select * from campaigns where org_id = ? and id = ?`)
      .get(orgId, campaignId) as Record<string, unknown> | undefined;
    return row ? this.mapCampaign(row) : null;
  }

  async updateCampaign(
    actor: SessionUser,
    orgId: string,
    campaignId: string,
    patch: Partial<{
      name: string;
      objective: CampaignObjective;
      status: CampaignStatus;
      adCopy: string;
      audience: Campaign["audience"];
      budget: Campaign["budget"];
      scheduleStart: string | null;
      scheduleEnd: string | null;
      landingPageId: string | null;
      formId: string | null;
      abTestEnabled: boolean;
      abVariants: Campaign["abVariants"];
      attributionModel: Campaign["attributionModel"];
      utm: UtmParams;
    }>,
  ): Promise<Campaign> {
    await this.gate(actor, orgId, "campaigns:write");
    const existing = await this.getCampaign(actor, orgId, campaignId);
    if (!existing) throw new AuthError("Campaign not found", "not_found");
    const next: Campaign = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `update campaigns set name=?, objective=?, status=?, audience=?, ad_copy=?,
         landing_page_id=?, form_id=?, utm=?, budget=?, schedule_start=?, schedule_end=?,
         ab_test_enabled=?, ab_variants=?, attribution_model=?, updated_at=?
         where org_id=? and id=?`,
      )
      .run(
        next.name,
        next.objective,
        next.status,
        JSON.stringify(next.audience),
        next.adCopy,
        next.landingPageId,
        next.formId,
        JSON.stringify(next.utm),
        JSON.stringify(next.budget),
        next.scheduleStart,
        next.scheduleEnd,
        next.abTestEnabled ? 1 : 0,
        JSON.stringify(next.abVariants),
        next.attributionModel,
        next.updatedAt,
        orgId,
        campaignId,
      );
    return next;
  }

  async duplicateCampaign(
    actor: SessionUser,
    orgId: string,
    campaignId: string,
  ): Promise<Campaign> {
    const src = await this.getCampaign(actor, orgId, campaignId);
    if (!src) throw new AuthError("Campaign not found", "not_found");
    return this.createCampaign(actor, orgId, {
      name: `${src.name} (copy)`,
      objective: src.objective,
      adCopy: src.adCopy,
      templateKey: src.templateKey ?? undefined,
      status: "draft",
      budget: src.budget,
      audience: src.audience,
      abTestEnabled: src.abTestEnabled,
      abVariants: src.abVariants.map((v) => ({ ...v, id: randomUUID() })),
      attributionModel: src.attributionModel,
    });
  }

  async campaignPerformance(
    actor: SessionUser,
    orgId: string,
    campaignId: string,
  ): Promise<CampaignPerformance> {
    await this.gate(actor, orgId, "campaigns:read");
    const rows = this.db
      .prepare(
        `select event_type from marketing_events where org_id = ? and campaign_id = ?`,
      )
      .all(orgId, campaignId) as Array<{ event_type: MarketingEvent["eventType"] }>;
    return {
      campaignId,
      ...aggregatePerformance(rows.map((r) => ({ eventType: r.event_type }))),
    };
  }

  suggestCopy(prompt: string) {
    return aiCopySuggestionHook({
      prompt,
      llmApiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? null,
    });
  }

  async listCreatives(actor: SessionUser, orgId: string): Promise<CreativeAsset[]> {
    await this.gate(actor, orgId, "campaigns:read");
    const rows = this.db
      .prepare(`select * from creative_assets where org_id = ? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      contentType: String(r.content_type),
      storagePath: String(r.storage_path),
      width: r.width == null ? null : Number(r.width),
      height: r.height == null ? null : Number(r.height),
      tags: jparse(String(r.tags), []),
      createdAt: String(r.created_at),
    }));
  }

  async createCreative(
    actor: SessionUser,
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
    await this.gate(actor, orgId, "campaigns:write");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into creative_assets(id, org_id, name, content_type, storage_path, width, height, tags, created_at)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.contentType,
        input.storagePath,
        input.width ?? null,
        input.height ?? null,
        JSON.stringify(input.tags ?? []),
        now,
      );
    return {
      id,
      orgId,
      name: input.name,
      contentType: input.contentType,
      storagePath: input.storagePath,
      width: input.width ?? null,
      height: input.height ?? null,
      tags: input.tags ?? [],
      createdAt: now,
    };
  }

  async listForms(actor: SessionUser, orgId: string): Promise<FormDefinition[]> {
    await this.gate(actor, orgId, "forms:read");
    const rows = this.db
      .prepare(`select * from forms where org_id = ? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapForm(r));
  }

  async createForm(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      campaignId?: string | null;
      templateKey?: string | null;
      fields?: FormField[];
      multiStep?: boolean;
      consentText?: string | null;
    },
  ): Promise<FormDefinition> {
    await this.gate(actor, orgId, "forms:write");
    const id = randomUUID();
    const now = nowIso();
    const fields =
      input.fields ??
      (input.templateKey === "lead_gen" || !input.fields
        ? leadGenFormTemplate()
        : input.fields);
    this.db
      .prepare(
        `insert into forms(
          id, org_id, campaign_id, name, status, fields, multi_step, spam_honeypot_enabled,
          duplicate_detection, consent_text, webhook_url, embed_enabled, version, template_key,
          thank_you_message, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.campaignId ?? null,
        input.name,
        "draft",
        JSON.stringify(fields),
        (input.multiStep ?? true) ? 1 : 0,
        1,
        1,
        input.consentText ?? "I agree to be contacted about this offer.",
        null,
        1,
        1,
        input.templateKey ?? "lead_gen",
        "Thanks — we will be in touch shortly.",
        now,
        now,
      );
    this.db
      .prepare(
        `insert into form_versions(id, org_id, form_id, version, fields, created_at, note)
         values (?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), orgId, id, 1, JSON.stringify(fields), now, "initial");
    return (await this.getForm(actor, orgId, id))!;
  }

  async getForm(
    actor: SessionUser,
    orgId: string,
    formId: string,
  ): Promise<FormDefinition | null> {
    await this.gate(actor, orgId, "forms:read");
    const row = this.db
      .prepare(`select * from forms where org_id = ? and id = ?`)
      .get(orgId, formId) as Record<string, unknown> | undefined;
    return row ? this.mapForm(row) : null;
  }

  /** Public read of published form (no session). */
  getPublishedForm(orgId: string, formId: string): FormDefinition | null {
    const row = this.db
      .prepare(`select * from forms where org_id = ? and id = ? and status = 'published'`)
      .get(orgId, formId) as Record<string, unknown> | undefined;
    return row ? this.mapForm(row) : null;
  }

  async updateForm(
    actor: SessionUser,
    orgId: string,
    formId: string,
    patch: Partial<{
      name: string;
      status: PublishStatus;
      fields: FormField[];
      multiStep: boolean;
      campaignId: string | null;
      consentText: string | null;
      webhookUrl: string | null;
      thankYouMessage: string;
      embedEnabled: boolean;
      spamHoneypotEnabled: boolean;
      duplicateDetection: boolean;
    }>,
  ): Promise<FormDefinition> {
    await this.gate(actor, orgId, "forms:write");
    const existing = await this.getForm(actor, orgId, formId);
    if (!existing) throw new AuthError("Form not found", "not_found");
    const fieldsChanged = patch.fields !== undefined;
    const next: FormDefinition = {
      ...existing,
      ...patch,
      version: fieldsChanged ? existing.version + 1 : existing.version,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `update forms set name=?, status=?, fields=?, multi_step=?, campaign_id=?,
         consent_text=?, webhook_url=?, thank_you_message=?, embed_enabled=?,
         spam_honeypot_enabled=?, duplicate_detection=?, version=?, updated_at=?
         where org_id=? and id=?`,
      )
      .run(
        next.name,
        next.status,
        JSON.stringify(next.fields),
        next.multiStep ? 1 : 0,
        next.campaignId,
        next.consentText,
        next.webhookUrl,
        next.thankYouMessage,
        next.embedEnabled ? 1 : 0,
        next.spamHoneypotEnabled ? 1 : 0,
        next.duplicateDetection ? 1 : 0,
        next.version,
        next.updatedAt,
        orgId,
        formId,
      );
    if (fieldsChanged) {
      this.db
        .prepare(
          `insert into form_versions(id, org_id, form_id, version, fields, created_at, note)
           values (?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          orgId,
          formId,
          next.version,
          JSON.stringify(next.fields),
          nowIso(),
          "edit",
        );
    }
    return next;
  }

  async duplicateForm(
    actor: SessionUser,
    orgId: string,
    formId: string,
  ): Promise<FormDefinition> {
    const src = await this.getForm(actor, orgId, formId);
    if (!src) throw new AuthError("Form not found", "not_found");
    return this.createForm(actor, orgId, {
      name: `${src.name} (copy)`,
      campaignId: src.campaignId,
      fields: src.fields.map((f) => ({ ...f, id: randomUUID() })),
      multiStep: src.multiStep,
      consentText: src.consentText,
      templateKey: src.templateKey,
    });
  }

  async listSubmissions(
    actor: SessionUser,
    orgId: string,
    formId: string,
  ): Promise<FormSubmission[]> {
    await this.gate(actor, orgId, "forms:read");
    const rows = this.db
      .prepare(
        `select * from form_submissions where org_id = ? and form_id = ? order by created_at desc`,
      )
      .all(orgId, formId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      formId: String(r.form_id),
      campaignId: r.campaign_id ? String(r.campaign_id) : null,
      leadId: r.lead_id ? String(r.lead_id) : null,
      payload: jparse(String(r.payload), {}),
      utm: jparse(String(r.utm), {}),
      fingerprint: String(r.fingerprint),
      duplicateOfId: r.duplicate_of_id ? String(r.duplicate_of_id) : null,
      createdAt: String(r.created_at),
    }));
  }

  async submitFormPublic(input: {
    orgId: string;
    formId: string;
    payload: Record<string, unknown>;
    honeypot?: string;
    utm?: Partial<UtmParams>;
    campaignId?: string | null;
  }): Promise<FormSubmission> {
    const form = this.getPublishedForm(input.orgId, input.formId);
    if (!form) throw new AuthError("Form not found or not published", "not_found");
    const validation = validateFormPayload(form, input.payload, input.honeypot);
    if (!validation.ok) {
      throw new AuthError(validation.errors.join("; "), "validation");
    }
    const fingerprint = submissionFingerprint(form.id, input.payload);
    let duplicateOfId: string | null = null;
    if (form.duplicateDetection) {
      const prior = this.db
        .prepare(
          `select id from form_submissions where org_id = ? and fingerprint = ? limit 1`,
        )
        .get(input.orgId, fingerprint) as { id: string } | undefined;
      if (prior) duplicateOfId = prior.id;
    }
    const campaignId = input.campaignId ?? form.campaignId;
    let leadId: string | null = null;
    if (this.crm && !duplicateOfId) {
      this.crm.registerOrg(input.orgId, input.orgId);
      const mapped = mapPayloadToLead(form, input.payload);
      const platformActor: SessionUser = {
        id: "system-public-form",
        email: "system@leadorbit.local",
        fullName: "Public Form",
        isPlatformAdmin: true,
      };
      const lead = await this.crm.createLead(platformActor, input.orgId, {
        fullName: mapped.fullName,
        email: mapped.email,
        phone: mapped.phone,
        source: campaignId ? `campaign:${campaignId}` : `form:${form.id}`,
        customFields: mapped.customFields,
        idempotencyKey: `formsub:${fingerprint}`,
      });
      leadId = lead.id;
    }
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into form_submissions(
          id, org_id, form_id, campaign_id, lead_id, payload, utm, fingerprint, duplicate_of_id, created_at
        ) values (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.orgId,
        form.id,
        campaignId,
        leadId,
        JSON.stringify(input.payload),
        JSON.stringify(input.utm ?? {}),
        fingerprint,
        duplicateOfId,
        now,
      );
    this.recordEventInternal({
      orgId: input.orgId,
      campaignId,
      formId: form.id,
      pageId: null,
      eventType: duplicateOfId ? "form_submit" : "conversion",
      meta: { submissionId: id, duplicate: Boolean(duplicateOfId) },
    });
    if (form.webhookUrl) {
      // Scaffolding only — do not claim delivery.
    }
    return {
      id,
      orgId: input.orgId,
      formId: form.id,
      campaignId,
      leadId,
      payload: input.payload,
      utm: input.utm ?? {},
      fingerprint,
      duplicateOfId,
      createdAt: now,
    };
  }

  async listPages(actor: SessionUser, orgId: string): Promise<LandingPage[]> {
    await this.gate(actor, orgId, "pages:read");
    const rows = this.db
      .prepare(`select * from landing_pages where org_id = ? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapPage(r));
  }

  async createPage(
    actor: SessionUser,
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
    await this.gate(actor, orgId, "pages:write");
    const id = randomUUID();
    const now = nowIso();
    const slug = slugifyToken(input.slug ?? input.name) || randomUUID().slice(0, 8);
    const document =
      input.document ??
      (input.templateKey === "real_estate"
        ? realEstateLandingTemplate()
        : sanitizePageDocument({
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
              {
                id: "form",
                type: "form",
                props: { heading: "Contact us" },
              },
            ],
          }));
    try {
      this.db
        .prepare(
          `insert into landing_pages(
            id, org_id, campaign_id, form_id, name, slug, status, document, template_key,
            version, published_at, created_at, updated_at
          ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          orgId,
          input.campaignId ?? null,
          input.formId ?? null,
          input.name,
          slug,
          "draft",
          JSON.stringify(document),
          input.templateKey ?? null,
          1,
          null,
          now,
          now,
        );
    } catch {
      throw new AuthError("Slug already exists", "conflict");
    }
    this.db
      .prepare(
        `insert into page_versions(id, org_id, page_id, version, document, created_at, note)
         values (?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), orgId, id, 1, JSON.stringify(document), now, "initial");
    return (await this.getPage(actor, orgId, id))!;
  }

  async getPage(
    actor: SessionUser,
    orgId: string,
    pageId: string,
  ): Promise<LandingPage | null> {
    await this.gate(actor, orgId, "pages:read");
    const row = this.db
      .prepare(`select * from landing_pages where org_id = ? and id = ?`)
      .get(orgId, pageId) as Record<string, unknown> | undefined;
    return row ? this.mapPage(row) : null;
  }

  getPublishedPageBySlug(orgId: string, slug: string): LandingPage | null {
    const row = this.db
      .prepare(
        `select * from landing_pages where org_id = ? and slug = ? and status = 'published'`,
      )
      .get(orgId, slug) as Record<string, unknown> | undefined;
    return row ? this.mapPage(row) : null;
  }

  async updatePage(
    actor: SessionUser,
    orgId: string,
    pageId: string,
    patch: Partial<{
      name: string;
      slug: string;
      document: PageDocument;
      campaignId: string | null;
      formId: string | null;
      status: PublishStatus;
    }>,
  ): Promise<LandingPage> {
    await this.gate(actor, orgId, "pages:write");
    const existing = await this.getPage(actor, orgId, pageId);
    if (!existing) throw new AuthError("Page not found", "not_found");
    const document = patch.document
      ? sanitizePageDocument(patch.document)
      : existing.document;
    const docChanged = patch.document !== undefined;
    const next: LandingPage = {
      ...existing,
      ...patch,
      document,
      version: docChanged ? existing.version + 1 : existing.version,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `update landing_pages set name=?, slug=?, document=?, campaign_id=?, form_id=?,
         status=?, version=?, updated_at=? where org_id=? and id=?`,
      )
      .run(
        next.name,
        next.slug,
        JSON.stringify(next.document),
        next.campaignId,
        next.formId,
        next.status,
        next.version,
        next.updatedAt,
        orgId,
        pageId,
      );
    if (docChanged) {
      this.db
        .prepare(
          `insert into page_versions(id, org_id, page_id, version, document, created_at, note)
           values (?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          orgId,
          pageId,
          next.version,
          JSON.stringify(next.document),
          nowIso(),
          "edit",
        );
    }
    return next;
  }

  async publishPage(
    actor: SessionUser,
    orgId: string,
    pageId: string,
  ): Promise<LandingPage> {
    const page = await this.updatePage(actor, orgId, pageId, { status: "published" });
    const now = nowIso();
    this.db
      .prepare(`update landing_pages set published_at=? where org_id=? and id=?`)
      .run(now, orgId, pageId);
    return { ...page, publishedAt: now, status: "published" };
  }

  async duplicatePage(
    actor: SessionUser,
    orgId: string,
    pageId: string,
  ): Promise<LandingPage> {
    const src = await this.getPage(actor, orgId, pageId);
    if (!src) throw new AuthError("Page not found", "not_found");
    return this.createPage(actor, orgId, {
      name: `${src.name} (copy)`,
      slug: `${src.slug}-copy-${randomUUID().slice(0, 4)}`,
      campaignId: src.campaignId,
      formId: src.formId,
      templateKey: src.templateKey,
      document: src.document,
    });
  }

  async listPageVersions(
    actor: SessionUser,
    orgId: string,
    pageId: string,
  ): Promise<PageVersion[]> {
    await this.gate(actor, orgId, "pages:read");
    const rows = this.db
      .prepare(
        `select * from page_versions where org_id = ? and page_id = ? order by version desc`,
      )
      .all(orgId, pageId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      pageId: String(r.page_id),
      version: Number(r.version),
      document: sanitizePageDocument(jparse(String(r.document), {})),
      createdAt: String(r.created_at),
      note: r.note ? String(r.note) : null,
    }));
  }

  async listFunnels(actor: SessionUser, orgId: string): Promise<Funnel[]> {
    await this.gate(actor, orgId, "pages:read");
    const rows = this.db
      .prepare(`select * from funnels where org_id = ? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      campaignId: r.campaign_id ? String(r.campaign_id) : null,
      name: String(r.name),
      status: r.status as PublishStatus,
      steps: jparse<FunnelStep[]>(String(r.steps), []),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createFunnel(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      campaignId?: string | null;
      steps?: FunnelStep[];
    },
  ): Promise<Funnel> {
    await this.gate(actor, orgId, "pages:write");
    const id = randomUUID();
    const now = nowIso();
    const steps = input.steps ?? [];
    this.db
      .prepare(
        `insert into funnels(id, org_id, campaign_id, name, status, steps, created_at, updated_at)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.campaignId ?? null,
        input.name,
        "draft",
        JSON.stringify(steps),
        now,
        now,
      );
    return {
      id,
      orgId,
      campaignId: input.campaignId ?? null,
      name: input.name,
      status: "draft",
      steps,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listMarketingEvents(
    actor: SessionUser,
    orgId: string,
  ): Promise<MarketingEvent[]> {
    await this.gate(actor, orgId, "campaigns:read");
    const rows = this.db
      .prepare(
        `select * from marketing_events where org_id = ? order by created_at desc limit 500`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      campaignId: r.campaign_id ? String(r.campaign_id) : null,
      pageId: r.page_id ? String(r.page_id) : null,
      formId: r.form_id ? String(r.form_id) : null,
      eventType: r.event_type as MarketingEvent["eventType"],
      meta: jparse(String(r.meta), {}),
      createdAt: String(r.created_at),
    }));
  }

  async trackEvent(
    actor: SessionUser,
    orgId: string,
    input: {
      campaignId?: string | null;
      pageId?: string | null;
      formId?: string | null;
      eventType: MarketingEvent["eventType"];
      meta?: Record<string, unknown>;
    },
  ): Promise<MarketingEvent> {
    await this.gate(actor, orgId, "campaigns:write");
    return this.recordEventInternal({
      orgId,
      campaignId: input.campaignId ?? null,
      pageId: input.pageId ?? null,
      formId: input.formId ?? null,
      eventType: input.eventType,
      meta: input.meta ?? {},
    });
  }

  /** Public page view tracking (no auth). */
  trackEventPublic(input: {
    orgId: string;
    campaignId?: string | null;
    pageId?: string | null;
    formId?: string | null;
    eventType: MarketingEvent["eventType"];
    meta?: Record<string, unknown>;
  }): MarketingEvent {
    return this.recordEventInternal({
      orgId: input.orgId,
      campaignId: input.campaignId ?? null,
      pageId: input.pageId ?? null,
      formId: input.formId ?? null,
      eventType: input.eventType,
      meta: input.meta ?? {},
    });
  }

  private recordEventInternal(input: {
    orgId: string;
    campaignId: string | null;
    pageId: string | null;
    formId: string | null;
    eventType: MarketingEvent["eventType"];
    meta: Record<string, unknown>;
  }): MarketingEvent {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into marketing_events(id, org_id, campaign_id, page_id, form_id, event_type, meta, created_at)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.orgId,
        input.campaignId,
        input.pageId,
        input.formId,
        input.eventType,
        JSON.stringify(input.meta),
        now,
      );
    return {
      id,
      orgId: input.orgId,
      campaignId: input.campaignId,
      pageId: input.pageId,
      formId: input.formId,
      eventType: input.eventType,
      meta: input.meta,
      createdAt: now,
    };
  }

  async listAdIntegrations(
    actor: SessionUser,
    orgId: string,
  ): Promise<AdIntegration[]> {
    await this.gate(actor, orgId, "campaigns:read");
    const rows = this.db
      .prepare(`select * from ad_integrations where org_id = ?`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      network: r.network as AdNetwork,
      status: r.status as AdIntegration["status"],
      externalAccountId: r.external_account_id
        ? String(r.external_account_id)
        : null,
      lastError: r.last_error ? String(r.last_error) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async authorizeAdNetwork(
    actor: SessionUser,
    orgId: string,
    network: AdNetwork,
  ): Promise<AdIntegration> {
    await this.gate(actor, orgId, "campaigns:write");
    const creds =
      network === "meta"
        ? metaAdsReadyForCreate()
        : Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
    const stub = adNetworkAuthorizeStub(network, creds);
    const now = nowIso();
    const existing = this.db
      .prepare(`select id from ad_integrations where org_id = ? and network = ?`)
      .get(orgId, network) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db
        .prepare(
          `update ad_integrations set status=?, last_error=?, updated_at=? where id=?`,
        )
        .run(stub.status, stub.detail, now, id);
    } else {
      this.db
        .prepare(
          `insert into ad_integrations(id, org_id, network, status, external_account_id, last_error, created_at, updated_at)
           values (?,?,?,?,?,?,?,?)`,
        )
        .run(id, orgId, network, stub.status, null, stub.detail, now, now);
    }
    return {
      id,
      orgId,
      network,
      status: stub.status,
      externalAccountId: null,
      lastError: stub.detail,
      createdAt: now,
      updatedAt: now,
    };
  }
}

function mapPayloadToLead(
  form: FormDefinition,
  payload: Record<string, unknown>,
): {
  fullName: string;
  email?: string;
  phone?: string;
  customFields: Record<string, unknown>;
} {
  let fullName = "";
  let email: string | undefined;
  let phone: string | undefined;
  const customFields: Record<string, unknown> = {};
  for (const field of form.fields) {
    const value = payload[field.key];
    if (value === undefined) continue;
    if (field.crmMapTo === "fullName") fullName = String(value);
    else if (field.crmMapTo === "email") email = String(value);
    else if (field.crmMapTo === "phone") phone = String(value);
    else if (field.crmMapTo === "custom") {
      customFields[field.customCrmKey ?? field.key] = value;
    }
  }
  if (!fullName) {
    fullName = String(payload.fullName ?? payload.name ?? email ?? "Form lead");
  }
  return { fullName, email, phone, customFields };
}
