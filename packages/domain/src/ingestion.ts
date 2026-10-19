import type { UtmParams } from "./campaigns";

export type IngestionChannel =
  | "form"
  | "landing_page"
  | "webhook"
  | "meta_lead_ads"
  | "google_lead_ads"
  | "public_capture";

export type IngestionStatus =
  | "accepted"
  | "duplicate"
  | "rejected"
  | "pending_configuration";

export type DeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "retrying"
  | "dead_letter";

export type AttributionModel = "last_touch" | "first_touch" | "linear";

export interface AttributionTouchpoint {
  id: string;
  orgId: string;
  leadId: string | null;
  opportunityId: string | null;
  campaignId: string | null;
  channel: IngestionChannel;
  utm: Partial<UtmParams>;
  occurredAt: string;
  meta: Record<string, unknown>;
}

export interface AttributionResult {
  model: AttributionModel;
  campaignId: string | null;
  touchpointIds: string[];
  weightByCampaign: Record<string, number>;
}

export interface IngestionEvent {
  id: string;
  orgId: string;
  channel: IngestionChannel;
  status: IngestionStatus;
  idempotencyKey: string | null;
  externalEventId: string | null;
  leadId: string | null;
  campaignId: string | null;
  formId: string | null;
  pageId: string | null;
  fingerprint: string | null;
  duplicateOfEventId: string | null;
  payload: Record<string, unknown>;
  error: string | null;
  createdAt: string;
}

export interface WebhookEndpoint {
  id: string;
  orgId: string;
  name: string;
  secret: string;
  enabled: boolean;
  channel: IngestionChannel;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  orgId: string;
  endpointId: string | null;
  direction: "inbound" | "outbound";
  targetUrl: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelAdapter {
  id: string;
  orgId: string;
  channel: IngestionChannel;
  enabled: boolean;
  config: Record<string, unknown>;
  status: "ready" | "pending_configuration" | "error";
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeIdempotencyKey(
  channel: IngestionChannel,
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const cleaned = key.trim().slice(0, 200);
  if (!cleaned) return null;
  return `${channel}:${cleaned}`;
}

export function ingestionFingerprint(input: {
  email?: string | null;
  phone?: string | null;
  externalEventId?: string | null;
}): string {
  if (input.externalEventId) return `ext:${input.externalEventId}`;
  const email = String(input.email ?? "")
    .toLowerCase()
    .trim();
  const phone = String(input.phone ?? "").replace(/\D/g, "");
  return `contact:${email}:${phone}`;
}

export function resolveAttribution(
  model: AttributionModel,
  touchpoints: AttributionTouchpoint[],
): AttributionResult {
  const withCampaign = touchpoints
    .filter((t) => t.campaignId)
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (withCampaign.length === 0) {
    return {
      model,
      campaignId: null,
      touchpointIds: [],
      weightByCampaign: {},
    };
  }
  if (model === "first_touch") {
    const first = withCampaign[0]!;
    return {
      model,
      campaignId: first.campaignId,
      touchpointIds: [first.id],
      weightByCampaign: { [first.campaignId!]: 1 },
    };
  }
  if (model === "last_touch") {
    const last = withCampaign[withCampaign.length - 1]!;
    return {
      model,
      campaignId: last.campaignId,
      touchpointIds: [last.id],
      weightByCampaign: { [last.campaignId!]: 1 },
    };
  }
  // linear
  const weight = 1 / withCampaign.length;
  const weightByCampaign: Record<string, number> = {};
  for (const t of withCampaign) {
    weightByCampaign[t.campaignId!] =
      (weightByCampaign[t.campaignId!] ?? 0) + weight;
  }
  const last = withCampaign[withCampaign.length - 1]!;
  return {
    model,
    campaignId: last.campaignId,
    touchpointIds: withCampaign.map((t) => t.id),
    weightByCampaign,
  };
}

export function nextRetryAt(
  attemptCount: number,
  fromMs = Date.now(),
): string | null {
  // Exponential backoff scaffolding: 30s, 2m, 10m, then dead_letter
  if (attemptCount >= 3) return null;
  const delays = [30_000, 120_000, 600_000];
  return new Date(fromMs + delays[attemptCount]!).toISOString();
}

export function advanceDeliveryStatus(
  current: DeliveryStatus,
  attemptCount: number,
  success: boolean,
): { status: DeliveryStatus; attemptCount: number; nextRetryAt: string | null } {
  if (success) {
    return { status: "delivered", attemptCount: attemptCount + 1, nextRetryAt: null };
  }
  const nextAttempt = attemptCount + 1;
  if (nextAttempt >= 3) {
    return { status: "dead_letter", attemptCount: nextAttempt, nextRetryAt: null };
  }
  return {
    status: "retrying",
    attemptCount: nextAttempt,
    nextRetryAt: nextRetryAt(nextAttempt - 1),
  };
}

export function leadAdsSyncStub(
  network: "meta_lead_ads" | "google_lead_ads",
  credentialsPresent: boolean,
): { status: "pending_configuration" | "authorized_stub"; detail: string } {
  if (!credentialsPresent) {
    return {
      status: "pending_configuration",
      detail: `${network} credentials missing — lead ads sync not started`,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${network} authorize stub accepted; live lead ads pull not claimed`,
  };
}

export function matchCampaignByUtm(
  campaigns: Array<{ id: string; utm: UtmParams }>,
  utm: Partial<UtmParams>,
): string | null {
  if (!utm.utmCampaign && !utm.utmSource) return null;
  const hit = campaigns.find((c) => {
    const sourceOk =
      !utm.utmSource || c.utm.utmSource === String(utm.utmSource).toLowerCase();
    const mediumOk =
      !utm.utmMedium || c.utm.utmMedium === String(utm.utmMedium).toLowerCase();
    const campOk =
      !utm.utmCampaign ||
      c.utm.utmCampaign === String(utm.utmCampaign).toLowerCase();
    return sourceOk && mediumOk && campOk;
  });
  return hit?.id ?? null;
}
