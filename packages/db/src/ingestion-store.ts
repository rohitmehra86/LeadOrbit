import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  advanceDeliveryStatus,
  hasPermission,
  ingestionFingerprint,
  leadAdsSyncStub,
  matchCampaignByUtm,
  normalizeIdempotencyKey,
  resolveAttribution,
  verifyWebhookSignature,
  type AttributionModel,
  type AttributionResult,
  type AttributionTouchpoint,
  type ChannelAdapter,
  type DeliveryStatus,
  type IngestionChannel,
  type IngestionEvent,
  type IngestionStatus,
  type UtmParams,
  type WebhookDelivery,
  type WebhookEndpoint,
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

type GatePerm = "integrations:read" | "integrations:write" | "ingestion:read";

export class IngestionStore {
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
    permission: GatePerm,
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private mapEvent(row: Record<string, unknown>): IngestionEvent {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      channel: row.channel as IngestionChannel,
      status: row.status as IngestionStatus,
      idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
      externalEventId: row.external_event_id
        ? String(row.external_event_id)
        : null,
      leadId: row.lead_id ? String(row.lead_id) : null,
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      formId: row.form_id ? String(row.form_id) : null,
      pageId: row.page_id ? String(row.page_id) : null,
      fingerprint: row.fingerprint ? String(row.fingerprint) : null,
      duplicateOfEventId: row.duplicate_of_event_id
        ? String(row.duplicate_of_event_id)
        : null,
      payload: jparse(String(row.payload), {}),
      error: row.error ? String(row.error) : null,
      createdAt: String(row.created_at),
    };
  }

  ensureDefaultAdapters(orgId: string): void {
    const channels: IngestionChannel[] = [
      "form",
      "landing_page",
      "webhook",
      "meta_lead_ads",
      "google_lead_ads",
      "public_capture",
    ];
    const now = nowIso();
    for (const channel of channels) {
      const pending =
        channel === "meta_lead_ads" || channel === "google_lead_ads";
      this.db
        .prepare(
          `insert into channel_adapters(id, org_id, channel, enabled, config, status, last_error, created_at, updated_at)
           values (?,?,?,?,?,?,?,?,?)
           on conflict(org_id, channel) do nothing`,
        )
        .run(
          randomUUID(),
          orgId,
          channel,
          1,
          JSON.stringify({}),
          pending ? "pending_configuration" : "ready",
          pending ? `${channel} credentials not configured` : null,
          now,
          now,
        );
    }
  }

  async listWebhookEndpoints(
    actor: SessionUser,
    orgId: string,
  ): Promise<WebhookEndpoint[]> {
    await this.gate(actor, orgId, "integrations:read");
    const rows = this.db
      .prepare(
        `select * from webhook_endpoints where org_id = ? order by created_at desc`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      secret: String(r.secret),
      enabled: Boolean(r.enabled),
      channel: r.channel as IngestionChannel,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createWebhookEndpoint(
    actor: SessionUser,
    orgId: string,
    input: { name: string; channel?: IngestionChannel },
  ): Promise<WebhookEndpoint> {
    await this.gate(actor, orgId, "integrations:write");
    this.ensureDefaultAdapters(orgId);
    const id = randomUUID();
    const now = nowIso();
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const channel = input.channel ?? "webhook";
    this.db
      .prepare(
        `insert into webhook_endpoints(id, org_id, name, secret, enabled, channel, created_at, updated_at)
         values (?,?,?,?,1,?,?,?)`,
      )
      .run(id, orgId, input.name, secret, channel, now, now);
    return {
      id,
      orgId,
      name: input.name,
      secret,
      enabled: true,
      channel,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listChannelAdapters(
    actor: SessionUser,
    orgId: string,
  ): Promise<ChannelAdapter[]> {
    await this.gate(actor, orgId, "integrations:read");
    this.ensureDefaultAdapters(orgId);
    const rows = this.db
      .prepare(`select * from channel_adapters where org_id = ?`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as IngestionChannel,
      enabled: Boolean(r.enabled),
      config: jparse(String(r.config), {}),
      status: r.status as ChannelAdapter["status"],
      lastError: r.last_error ? String(r.last_error) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async listIngestionEvents(
    actor: SessionUser,
    orgId: string,
    limit = 50,
  ): Promise<IngestionEvent[]> {
    await this.gate(actor, orgId, "ingestion:read");
    const rows = this.db
      .prepare(
        `select * from ingestion_events where org_id = ? order by created_at desc limit ?`,
      )
      .all(orgId, limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapEvent(r));
  }

  async listDeliveries(
    actor: SessionUser,
    orgId: string,
  ): Promise<WebhookDelivery[]> {
    await this.gate(actor, orgId, "integrations:read");
    const rows = this.db
      .prepare(
        `select * from webhook_deliveries where org_id = ? order by created_at desc limit 100`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapDelivery(r));
  }

  private mapDelivery(r: Record<string, unknown>): WebhookDelivery {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      endpointId: r.endpoint_id ? String(r.endpoint_id) : null,
      direction: r.direction as "inbound" | "outbound",
      targetUrl: r.target_url ? String(r.target_url) : null,
      status: r.status as DeliveryStatus,
      attemptCount: Number(r.attempt_count),
      nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : null,
      lastStatusCode: r.last_status_code == null ? null : Number(r.last_status_code),
      lastError: r.last_error ? String(r.last_error) : null,
      payload: jparse(String(r.payload), {}),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  /** Resolve campaign from explicit id or UTM match against campaigns table. */
  private resolveCampaignId(
    orgId: string,
    campaignId: string | null | undefined,
    utm: Partial<UtmParams>,
  ): string | null {
    if (campaignId) return campaignId;
    const rows = this.db
      .prepare(`select id, utm from campaigns where org_id = ?`)
      .all(orgId) as Array<{ id: string; utm: string }>;
    const campaigns = rows.map((r) => ({
      id: r.id,
      utm: jparse<UtmParams>(r.utm, {
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
      }),
    }));
    return matchCampaignByUtm(campaigns, {
      utmSource: utm.utmSource?.toLowerCase(),
      utmMedium: utm.utmMedium?.toLowerCase(),
      utmCampaign: utm.utmCampaign?.toLowerCase(),
    });
  }

  /**
   * Unified inbound lead ingestion pipeline used by forms, webhooks, channels.
   */
  async ingestLead(input: {
    orgId: string;
    channel: IngestionChannel;
    fullName?: string;
    email?: string;
    phone?: string;
    source?: string;
    utm?: Partial<UtmParams>;
    campaignId?: string | null;
    formId?: string | null;
    pageId?: string | null;
    opportunityId?: string | null;
    idempotencyKey?: string | null;
    externalEventId?: string | null;
    payload?: Record<string, unknown>;
    attributionModel?: AttributionModel;
    customFields?: Record<string, unknown>;
  }): Promise<{
    event: IngestionEvent;
    leadId: string | null;
    attribution: AttributionResult | null;
    duplicate: boolean;
  }> {
    this.ensureDefaultAdapters(input.orgId);
    const idem = normalizeIdempotencyKey(
      input.channel,
      input.idempotencyKey ?? input.externalEventId,
    );
    if (idem) {
      const existing = this.db
        .prepare(
          `select * from ingestion_events where org_id = ? and idempotency_key = ?`,
        )
        .get(input.orgId, idem) as Record<string, unknown> | undefined;
      if (existing) {
        const event = this.mapEvent(existing);
        return {
          event,
          leadId: event.leadId,
          attribution: event.leadId
            ? await this.getLeadAttributionInternal(input.orgId, event.leadId)
            : null,
          duplicate: true,
        };
      }
    }

    const fingerprint = ingestionFingerprint({
      email: input.email,
      phone: input.phone,
      externalEventId: input.externalEventId,
    });
    let duplicateOfEventId: string | null = null;
    const prior = this.db
      .prepare(
        `select id, lead_id from ingestion_events
         where org_id = ? and fingerprint = ? and status = 'accepted'
         order by created_at asc limit 1`,
      )
      .get(input.orgId, fingerprint) as
      | { id: string; lead_id: string | null }
      | undefined;
    if (prior && !input.externalEventId) {
      duplicateOfEventId = prior.id;
    }

    const campaignId = this.resolveCampaignId(
      input.orgId,
      input.campaignId,
      input.utm ?? {},
    );

    let leadId: string | null = null;
    let status: IngestionStatus = "accepted";
    let error: string | null = null;

    if (duplicateOfEventId) {
      status = "duplicate";
      leadId = prior?.lead_id ?? null;
    } else if (!this.crm) {
      status = "rejected";
      error = "CRM store not linked";
    } else {
      this.crm.registerOrg(input.orgId, input.orgId);
      const actor: SessionUser = {
        id: "system-ingestion",
        email: "ingestion@leadorbit.local",
        fullName: "Ingestion Pipeline",
        isPlatformAdmin: true,
      };
      try {
        const lead = await this.crm.createLead(actor, input.orgId, {
          fullName: input.fullName ?? "Ingested lead",
          email: input.email,
          phone: input.phone,
          source: input.source ?? input.channel,
          customFields: {
            ...(input.customFields ?? {}),
            utm: input.utm ?? {},
            ingestionChannel: input.channel,
          },
          idempotencyKey: idem,
        });
        leadId = lead.id;
      } catch (err) {
        status = "rejected";
        error = err instanceof Error ? err.message : "ingest failed";
      }
    }

    const eventId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into ingestion_events(
          id, org_id, channel, status, idempotency_key, external_event_id, lead_id,
          campaign_id, form_id, page_id, fingerprint, duplicate_of_event_id, payload, error, created_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        input.orgId,
        input.channel,
        status,
        idem,
        input.externalEventId ?? null,
        leadId,
        campaignId,
        input.formId ?? null,
        input.pageId ?? null,
        fingerprint,
        duplicateOfEventId,
        JSON.stringify(input.payload ?? {}),
        error,
        now,
      );

    // Inbound delivery audit row
    this.recordDelivery({
      orgId: input.orgId,
      endpointId: null,
      direction: "inbound",
      targetUrl: null,
      status: status === "rejected" ? "failed" : "delivered",
      payload: {
        eventId,
        channel: input.channel,
        status,
      },
      lastStatusCode: status === "rejected" ? 400 : 202,
      lastError: error,
    });

    let attribution: AttributionResult | null = null;
    if (leadId && status === "accepted") {
      this.recordTouchpoint({
        orgId: input.orgId,
        leadId,
        opportunityId: input.opportunityId ?? null,
        campaignId,
        channel: input.channel,
        utm: input.utm ?? {},
        meta: {
          formId: input.formId ?? null,
          pageId: input.pageId ?? null,
          eventId,
        },
      });
      attribution = this.recomputeLeadAttribution(
        input.orgId,
        leadId,
        input.attributionModel ?? "last_touch",
        input.opportunityId ?? null,
      );
    }

    const event = this.mapEvent(
      this.db
        .prepare(`select * from ingestion_events where id = ?`)
        .get(eventId) as Record<string, unknown>,
    );

    return {
      event,
      leadId,
      attribution,
      duplicate: status === "duplicate" || Boolean(idem && duplicateOfEventId),
    };
  }

  /**
   * Record attribution for an already-created lead (e.g. form pipeline).
   */
  recordPostCreateAttribution(input: {
    orgId: string;
    leadId: string;
    channel: IngestionChannel;
    campaignId?: string | null;
    formId?: string | null;
    pageId?: string | null;
    opportunityId?: string | null;
    utm?: Partial<UtmParams>;
    idempotencyKey?: string | null;
    payload?: Record<string, unknown>;
    attributionModel?: AttributionModel;
    duplicate?: boolean;
  }): IngestionEvent {
    const campaignId = this.resolveCampaignId(
      input.orgId,
      input.campaignId,
      input.utm ?? {},
    );
    const idem = normalizeIdempotencyKey(input.channel, input.idempotencyKey);
    const eventId = randomUUID();
    const now = nowIso();
    const status: IngestionStatus = input.duplicate ? "duplicate" : "accepted";
    try {
      this.db
        .prepare(
          `insert into ingestion_events(
            id, org_id, channel, status, idempotency_key, external_event_id, lead_id,
            campaign_id, form_id, page_id, fingerprint, duplicate_of_event_id, payload, error, created_at
          ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          eventId,
          input.orgId,
          input.channel,
          status,
          idem,
          null,
          input.leadId,
          campaignId,
          input.formId ?? null,
          input.pageId ?? null,
          null,
          null,
          JSON.stringify(input.payload ?? {}),
          null,
          now,
        );
    } catch {
      // idempotent re-entry
      if (idem) {
        const existing = this.db
          .prepare(
            `select * from ingestion_events where org_id = ? and idempotency_key = ?`,
          )
          .get(input.orgId, idem) as Record<string, unknown> | undefined;
        if (existing) return this.mapEvent(existing);
      }
    }
    if (!input.duplicate) {
      this.recordTouchpoint({
        orgId: input.orgId,
        leadId: input.leadId,
        opportunityId: input.opportunityId ?? null,
        campaignId,
        channel: input.channel,
        utm: input.utm ?? {},
        meta: { formId: input.formId, pageId: input.pageId, eventId },
      });
      this.recomputeLeadAttribution(
        input.orgId,
        input.leadId,
        input.attributionModel ?? "last_touch",
        input.opportunityId ?? null,
      );
    }
    return this.mapEvent(
      this.db
        .prepare(`select * from ingestion_events where id = ?`)
        .get(eventId) as Record<string, unknown>,
    );
  }

  private recordTouchpoint(input: {
    orgId: string;
    leadId: string;
    opportunityId: string | null;
    campaignId: string | null;
    channel: IngestionChannel;
    utm: Partial<UtmParams>;
    meta: Record<string, unknown>;
  }): AttributionTouchpoint {
    const id = randomUUID();
    const occurredAt = nowIso();
    this.db
      .prepare(
        `insert into attribution_touchpoints(
          id, org_id, lead_id, opportunity_id, campaign_id, channel, utm, occurred_at, meta
        ) values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.orgId,
        input.leadId,
        input.opportunityId,
        input.campaignId,
        input.channel,
        JSON.stringify(input.utm),
        occurredAt,
        JSON.stringify(input.meta),
      );
    return {
      id,
      orgId: input.orgId,
      leadId: input.leadId,
      opportunityId: input.opportunityId,
      campaignId: input.campaignId,
      channel: input.channel,
      utm: input.utm,
      occurredAt,
      meta: input.meta,
    };
  }

  private listTouchpoints(orgId: string, leadId: string): AttributionTouchpoint[] {
    const rows = this.db
      .prepare(
        `select * from attribution_touchpoints where org_id = ? and lead_id = ? order by occurred_at asc`,
      )
      .all(orgId, leadId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      leadId: r.lead_id ? String(r.lead_id) : null,
      opportunityId: r.opportunity_id ? String(r.opportunity_id) : null,
      campaignId: r.campaign_id ? String(r.campaign_id) : null,
      channel: r.channel as IngestionChannel,
      utm: jparse(String(r.utm), {}),
      occurredAt: String(r.occurred_at),
      meta: jparse(String(r.meta), {}),
    }));
  }

  private recomputeLeadAttribution(
    orgId: string,
    leadId: string,
    model: AttributionModel,
    opportunityId: string | null,
  ): AttributionResult {
    const tps = this.listTouchpoints(orgId, leadId);
    const result = resolveAttribution(model, tps);
    this.db
      .prepare(
        `insert into lead_attribution(lead_id, org_id, model, campaign_id, opportunity_id, weight_by_campaign, updated_at)
         values (?,?,?,?,?,?,?)
         on conflict(lead_id, org_id) do update set
           model=excluded.model,
           campaign_id=excluded.campaign_id,
           opportunity_id=excluded.opportunity_id,
           weight_by_campaign=excluded.weight_by_campaign,
           updated_at=excluded.updated_at`,
      )
      .run(
        leadId,
        orgId,
        model,
        result.campaignId,
        opportunityId,
        JSON.stringify(result.weightByCampaign),
        nowIso(),
      );
    return result;
  }

  private async getLeadAttributionInternal(
    orgId: string,
    leadId: string,
  ): Promise<AttributionResult | null> {
    const row = this.db
      .prepare(
        `select * from lead_attribution where org_id = ? and lead_id = ?`,
      )
      .get(orgId, leadId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      model: row.model as AttributionModel,
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      touchpointIds: this.listTouchpoints(orgId, leadId).map((t) => t.id),
      weightByCampaign: jparse(String(row.weight_by_campaign), {}),
    };
  }

  async getLeadAttribution(
    actor: SessionUser,
    orgId: string,
    leadId: string,
  ): Promise<{
    attribution: AttributionResult | null;
    touchpoints: AttributionTouchpoint[];
  }> {
    await this.gate(actor, orgId, "ingestion:read");
    return {
      attribution: await this.getLeadAttributionInternal(orgId, leadId),
      touchpoints: this.listTouchpoints(orgId, leadId),
    };
  }

  async linkOpportunityAttribution(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    opportunityId: string,
    model: AttributionModel = "last_touch",
  ): Promise<AttributionResult> {
    await this.gate(actor, orgId, "integrations:write");
    const tps = this.listTouchpoints(orgId, leadId);
    if (tps.length === 0) {
      throw new AuthError("No attribution touchpoints for lead", "not_found");
    }
    // Attach opportunity to latest touchpoint meta via recompute
    this.db
      .prepare(
        `update attribution_touchpoints set opportunity_id = ? where org_id = ? and lead_id = ?`,
      )
      .run(opportunityId, orgId, leadId);
    return this.recomputeLeadAttribution(orgId, leadId, model, opportunityId);
  }

  /**
   * Signed inbound webhook: verify signature, enforce idempotency, ingest lead.
   */
  async processInboundWebhook(input: {
    orgId: string;
    endpointId: string;
    rawBody: string;
    timestamp: string;
    signature: string;
  }): Promise<{
    event: IngestionEvent;
    leadId: string | null;
    duplicate: boolean;
  }> {
    const endpoint = this.db
      .prepare(`select * from webhook_endpoints where org_id = ? and id = ?`)
      .get(input.orgId, input.endpointId) as Record<string, unknown> | undefined;
    if (!endpoint || !endpoint.enabled) {
      throw new AuthError("Webhook endpoint not found", "not_found");
    }

    const verified = verifyWebhookSignature({
      secret: String(endpoint.secret),
      timestamp: input.timestamp,
      rawBody: input.rawBody,
      signature: input.signature,
    });
    if (!verified.ok) {
      this.recordDelivery({
        orgId: input.orgId,
        endpointId: input.endpointId,
        direction: "inbound",
        targetUrl: null,
        status: "failed",
        payload: { reason: verified.reason },
        lastStatusCode: 401,
        lastError: verified.reason,
      });
      throw new AuthError(verified.reason, "unauthorized");
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      throw new AuthError("Invalid JSON body", "validation");
    }

    const idempotencyKey =
      (body.idempotencyKey as string | undefined) ??
      (body.eventId as string | undefined) ??
      null;
    const utm = (body.utm as Partial<UtmParams> | undefined) ?? {
      utmSource: body.utm_source as string | undefined,
      utmMedium: body.utm_medium as string | undefined,
      utmCampaign: body.utm_campaign as string | undefined,
    };

    const result = await this.ingestLead({
      orgId: input.orgId,
      channel: (endpoint.channel as IngestionChannel) || "webhook",
      fullName: String(body.fullName ?? body.name ?? "Webhook lead"),
      email: body.email ? String(body.email) : undefined,
      phone: body.phone ? String(body.phone) : undefined,
      source: String(body.source ?? "webhook"),
      utm,
      campaignId: body.campaignId ? String(body.campaignId) : null,
      idempotencyKey,
      externalEventId: body.eventId ? String(body.eventId) : null,
      payload: body,
    });

    this.recordDelivery({
      orgId: input.orgId,
      endpointId: input.endpointId,
      direction: "inbound",
      targetUrl: null,
      status: "delivered",
      payload: { eventId: result.event.id, duplicate: result.duplicate },
      lastStatusCode: result.duplicate ? 200 : 202,
      lastError: null,
    });

    return {
      event: result.event,
      leadId: result.leadId,
      duplicate: result.duplicate,
    };
  }

  /** Outbound delivery scaffolding — records retry/status without claiming live HTTP. */
  async enqueueOutboundDelivery(
    actor: SessionUser,
    orgId: string,
    input: {
      targetUrl: string;
      payload: Record<string, unknown>;
      endpointId?: string | null;
    },
  ): Promise<WebhookDelivery> {
    await this.gate(actor, orgId, "integrations:write");
    return this.recordDelivery({
      orgId,
      endpointId: input.endpointId ?? null,
      direction: "outbound",
      targetUrl: input.targetUrl,
      status: "pending",
      payload: input.payload,
      lastStatusCode: null,
      lastError: "Outbound delivery scaffolding — not sent (no live HTTP claimed)",
    });
  }

  async syncDeliveryStatus(
    actor: SessionUser,
    orgId: string,
    deliveryId: string,
    input: { success: boolean; statusCode?: number; error?: string },
  ): Promise<WebhookDelivery> {
    await this.gate(actor, orgId, "integrations:write");
    const row = this.db
      .prepare(`select * from webhook_deliveries where org_id = ? and id = ?`)
      .get(orgId, deliveryId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Delivery not found", "not_found");
    const advanced = advanceDeliveryStatus(
      row.status as DeliveryStatus,
      Number(row.attempt_count),
      input.success,
    );
    const now = nowIso();
    this.db
      .prepare(
        `update webhook_deliveries set status=?, attempt_count=?, next_retry_at=?,
         last_status_code=?, last_error=?, updated_at=? where id=?`,
      )
      .run(
        advanced.status,
        advanced.attemptCount,
        advanced.nextRetryAt,
        input.statusCode ?? null,
        input.error ?? (input.success ? null : "delivery failed"),
        now,
        deliveryId,
      );
    return this.mapDelivery(
      this.db
        .prepare(`select * from webhook_deliveries where id = ?`)
        .get(deliveryId) as Record<string, unknown>,
    );
  }

  private recordDelivery(input: {
    orgId: string;
    endpointId: string | null;
    direction: "inbound" | "outbound";
    targetUrl: string | null;
    status: DeliveryStatus;
    payload: Record<string, unknown>;
    lastStatusCode: number | null;
    lastError: string | null;
  }): WebhookDelivery {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into webhook_deliveries(
          id, org_id, endpoint_id, direction, target_url, status, attempt_count,
          next_retry_at, last_status_code, last_error, payload, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.orgId,
        input.endpointId,
        input.direction,
        input.targetUrl,
        input.status,
        input.status === "pending" ? 0 : 1,
        null,
        input.lastStatusCode,
        input.lastError,
        JSON.stringify(input.payload),
        now,
        now,
      );
    return this.mapDelivery(
      this.db
        .prepare(`select * from webhook_deliveries where id = ?`)
        .get(id) as Record<string, unknown>,
    );
  }

  async authorizeLeadAds(
    actor: SessionUser,
    orgId: string,
    network: "meta_lead_ads" | "google_lead_ads",
  ): Promise<ChannelAdapter> {
    await this.gate(actor, orgId, "integrations:write");
    this.ensureDefaultAdapters(orgId);
    const creds =
      network === "meta_lead_ads"
        ? Boolean(process.env.META_ADS_ACCESS_TOKEN)
        : Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
    const stub = leadAdsSyncStub(network, creds);
    const status: ChannelAdapter["status"] =
      stub.status === "pending_configuration"
        ? "pending_configuration"
        : "ready";
    const now = nowIso();
    this.db
      .prepare(
        `update channel_adapters set status=?, last_error=?, updated_at=? where org_id=? and channel=?`,
      )
      .run(status, stub.detail, now, orgId, network);
    const row = this.db
      .prepare(`select * from channel_adapters where org_id = ? and channel = ?`)
      .get(orgId, network) as Record<string, unknown>;
    return {
      id: String(row.id),
      orgId,
      channel: network,
      enabled: Boolean(row.enabled),
      config: jparse(String(row.config), {}),
      status: row.status as ChannelAdapter["status"],
      lastError: row.last_error ? String(row.last_error) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  /**
   * Meta/Google lead ads pull stub — always refuses live success without claiming fake leads.
   */
  async pullLeadAds(
    actor: SessionUser,
    orgId: string,
    network: "meta_lead_ads" | "google_lead_ads",
  ): Promise<{
    status: "pending_configuration";
    detail: string;
    imported: number;
  }> {
    await this.gate(actor, orgId, "integrations:write");
    const adapter = await this.authorizeLeadAds(actor, orgId, network);
    // Never invent leads — live Ads API pull is not wired.
    if (adapter.status === "pending_configuration") {
      return {
        status: "pending_configuration",
        detail:
          adapter.lastError ??
          `${network} pull blocked — credentials not configured`,
        imported: 0,
      };
    }
    return {
      status: "pending_configuration",
      detail: `${network} authorize stub ok, but live lead ads pull is not implemented — imported=0`,
      imported: 0,
    };
  }
}
