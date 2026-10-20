import { randomBytes } from "node:crypto";
import { AuthError, type SessionUser } from "@leadorbit/db";
import type {
  ChannelAdapter,
  IngestionChannel,
  IngestionEvent,
  WebhookDelivery,
  WebhookEndpoint,
} from "@leadorbit/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

function mapEvent(row: Record<string, unknown>): IngestionEvent {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    channel: row.channel as IngestionChannel,
    status: row.status as IngestionEvent["status"],
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    externalEventId: (row.external_event_id as string | null) ?? null,
    leadId: (row.lead_id as string | null) ?? null,
    campaignId: (row.campaign_id as string | null) ?? null,
    formId: (row.form_id as string | null) ?? null,
    pageId: (row.page_id as string | null) ?? null,
    fingerprint: (row.fingerprint as string | null) ?? null,
    duplicateOfEventId: (row.duplicate_of_event_id as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

/** Durable ingestion/attribution for AUTH_MODE=supabase. */
export class SupabaseIngestionStore {
  setCrmStore(_crm: unknown): void {
    // no-op
  }

  async listWebhookEndpoints(
    _actor: SessionUser,
    orgId: string,
  ): Promise<WebhookEndpoint[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
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
    _actor: SessionUser,
    orgId: string,
    input: { name: string; channel?: IngestionChannel },
  ): Promise<WebhookEndpoint> {
    const supabase = await client();
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        secret,
        enabled: true,
        channel: input.channel ?? "webhook",
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      secret: String(r.secret),
      enabled: Boolean(r.enabled),
      channel: r.channel as IngestionChannel,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listChannelAdapters(
    _actor: SessionUser,
    orgId: string,
  ): Promise<ChannelAdapter[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("channel_adapters")
      .select("*")
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      channel: r.channel as IngestionChannel,
      enabled: Boolean(r.enabled),
      config: (r.config as Record<string, unknown>) ?? {},
      status: r.status as ChannelAdapter["status"],
      lastError: (r.last_error as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async listIngestionEvents(
    _actor: SessionUser,
    orgId: string,
    limit = 50,
  ): Promise<IngestionEvent[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("ingestion_events")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapEvent);
  }

  async listDeliveries(_actor: SessionUser, orgId: string): Promise<WebhookDelivery[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("webhook_deliveries")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      endpointId: (r.endpoint_id as string | null) ?? null,
      direction: r.direction as WebhookDelivery["direction"],
      targetUrl: (r.target_url as string | null) ?? null,
      status: r.status as WebhookDelivery["status"],
      attemptCount: Number(r.attempt_count ?? 0),
      nextRetryAt: (r.next_retry_at as string | null) ?? null,
      lastStatusCode: (r.last_status_code as number | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      payload: (r.payload as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async recordPostCreateAttribution(input: {
    orgId: string;
    leadId: string;
    channel: IngestionChannel;
    campaignId?: string | null;
    formId?: string | null;
    pageId?: string | null;
    utm?: Record<string, unknown>;
    idempotencyKey?: string | null;
    payload?: Record<string, unknown>;
    duplicate?: boolean;
  }): Promise<IngestionEvent> {
    const supabase = await client();
    const status = input.duplicate ? "duplicate" : "accepted";
    await supabase.from("attribution_touchpoints").insert({
      org_id: input.orgId,
      lead_id: input.leadId,
      campaign_id: input.campaignId ?? null,
      channel: input.channel,
      utm: input.utm ?? {},
      meta: { formId: input.formId ?? null, pageId: input.pageId ?? null },
    });
    const weight: Record<string, number> = {};
    if (input.campaignId) weight[input.campaignId] = 1;
    await supabase.from("lead_attribution").upsert(
      {
        org_id: input.orgId,
        lead_id: input.leadId,
        model: "last_touch",
        campaign_id: input.campaignId ?? null,
        weight_by_campaign: weight,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lead_id,org_id" },
    );
    const { data, error } = await supabase
      .from("ingestion_events")
      .insert({
        org_id: input.orgId,
        channel: input.channel,
        status,
        idempotency_key: input.idempotencyKey
          ? `${input.channel}:${input.idempotencyKey}`
          : null,
        lead_id: input.leadId,
        campaign_id: input.campaignId ?? null,
        form_id: input.formId ?? null,
        page_id: input.pageId ?? null,
        payload: input.payload ?? {
          leadId: input.leadId,
          campaignId: input.campaignId ?? null,
          formId: input.formId ?? null,
        },
      })
      .select("*")
      .single();
    if (error) {
      // Unique idempotency — return a synthetic accepted duplicate marker.
      if (error.code === "23505") {
        return {
          id: input.idempotencyKey ?? "dup",
          orgId: input.orgId,
          channel: input.channel,
          status: "duplicate",
          idempotencyKey: input.idempotencyKey ?? null,
          externalEventId: null,
          leadId: input.leadId,
          campaignId: input.campaignId ?? null,
          formId: input.formId ?? null,
          pageId: input.pageId ?? null,
          fingerprint: null,
          duplicateOfEventId: null,
          payload: input.payload ?? {},
          error: null,
          createdAt: new Date().toISOString(),
        };
      }
      throw new AuthError(error.message, "validation");
    }
    return mapEvent(data as Record<string, unknown>);
  }

  async getLeadAttribution(_actor: SessionUser, orgId: string, leadId: string) {
    const supabase = await client();
    const { data, error } = await supabase
      .from("lead_attribution")
      .select("*")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      orgId: String(r.org_id),
      leadId: String(r.lead_id),
      model: String(r.model ?? "last_touch"),
      campaignId: (r.campaign_id as string | null) ?? null,
      opportunityId: (r.opportunity_id as string | null) ?? null,
      weightByCampaign: (r.weight_by_campaign as Record<string, number>) ?? {},
      updatedAt: String(r.updated_at),
    };
  }

  async linkOpportunityAttribution(): Promise<never> {
    throw new AuthError(
      "Opportunity attribution link on Supabase adapter is not wired yet",
      "validation",
    );
  }

  async enqueueOutboundDelivery(): Promise<never> {
    throw new AuthError(
      "Outbound webhook delivery blocked: no fake provider success without configured endpoints",
      "validation",
    );
  }

  async syncDeliveryStatus(): Promise<never> {
    throw new AuthError("Delivery sync not available on Supabase adapter yet", "validation");
  }

  async processInboundWebhook(): Promise<never> {
    throw new AuthError(
      "Inbound lead webhooks on Supabase require signed processing (partial — use public form RPC)",
      "validation",
    );
  }

  async ingestLead(): Promise<never> {
    throw new AuthError(
      "Token-based public/leads ingest on Supabase is not wired (use published form submit RPC)",
      "validation",
    );
  }
}

let singleton: SupabaseIngestionStore | null = null;
export function getSupabaseIngestionStore(): SupabaseIngestionStore {
  if (!singleton) singleton = new SupabaseIngestionStore();
  return singleton;
}
