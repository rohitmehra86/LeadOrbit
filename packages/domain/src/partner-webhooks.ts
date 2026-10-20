/**
 * Wave 6 — Zapier/n8n-style partner webhooks.
 * Outbound: signed event delivery with retries (never fake delivered).
 * Inbound: signature verify + event_id idempotency.
 */

import type { DeliveryStatus } from "./ingestion";
import { advanceDeliveryStatus } from "./ingestion";

export type PartnerEventType =
  | "lead.created"
  | "lead.updated"
  | "lead.qualified"
  | "appointment.booked"
  | "campaign.published"
  | "message.received"
  | "billing.subscription_updated"
  | "partner.test";

export const PARTNER_EVENT_CATALOG: ReadonlyArray<{
  type: PartnerEventType;
  description: string;
  zapierHint: string;
}> = [
  {
    type: "lead.created",
    description: "A new lead was created in the CRM",
    zapierHint: "Trigger → Create/update row in Sheets, CRM, Slack",
  },
  {
    type: "lead.updated",
    description: "Lead fields or score changed",
    zapierHint: "Trigger → Sync status to external tools",
  },
  {
    type: "lead.qualified",
    description: "Lead crossed qualification threshold",
    zapierHint: "Trigger → Notify sales / create deal",
  },
  {
    type: "appointment.booked",
    description: "An appointment was booked",
    zapierHint: "Trigger → Calendar / SMS reminder in n8n",
  },
  {
    type: "campaign.published",
    description: "A landing page / form pack was published",
    zapierHint: "Trigger → Notify channel owners",
  },
  {
    type: "message.received",
    description: "Inbound inbox message received",
    zapierHint: "Trigger → Ticket / Slack thread",
  },
  {
    type: "billing.subscription_updated",
    description: "Subscription status/plan changed (webhook-activated only)",
    zapierHint: "Trigger → Provision seats / revoke access",
  },
  {
    type: "partner.test",
    description: "Manual test ping from Developers console",
    zapierHint: "Verify endpoint signing before going live",
  },
];

export interface OutboundWebhookSubscription {
  id: string;
  orgId: string;
  name: string;
  targetUrl: string;
  secret: string;
  eventTypes: PartnerEventType[];
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundWebhookDelivery {
  id: string;
  orgId: string;
  subscriptionId: string;
  eventType: PartnerEventType;
  eventId: string;
  status: DeliveryStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InboundPartnerEvent {
  id: string;
  orgId: string;
  partner: string;
  eventId: string;
  eventType: string;
  status: "accepted" | "duplicate" | "rejected";
  detail: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function isPartnerEventType(value: string): value is PartnerEventType {
  return PARTNER_EVENT_CATALOG.some((e) => e.type === value);
}

export function normalizeEventTypes(
  input: string[] | undefined,
): PartnerEventType[] {
  if (!input?.length) return ["lead.created", "partner.test"];
  const out: PartnerEventType[] = [];
  for (const raw of input) {
    if (isPartnerEventType(raw) && !out.includes(raw)) out.push(raw);
  }
  return out.length ? out : ["partner.test"];
}

export function validateOutboundTargetUrl(
  url: string,
): { ok: true; url: string } | { ok: false; detail: string } {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, detail: "URL must be http(s)" };
    }
    // Allow http only for local/dev hooks (Zapier CLI, n8n local)
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "localhost"
    ) {
      return {
        ok: false,
        detail: "Non-local outbound URLs must use https",
      };
    }
    return { ok: true, url: trimmed };
  } catch {
    return { ok: false, detail: "Invalid target URL" };
  }
}

/** Build signed outbound envelope for Zapier/n8n Catch Hook consumers. */
export function buildOutboundWebhookEnvelope(input: {
  orgId: string;
  eventType: PartnerEventType;
  eventId: string;
  data: Record<string, unknown>;
  occurredAt?: string;
}): {
  id: string;
  type: PartnerEventType;
  orgId: string;
  occurredAt: string;
  data: Record<string, unknown>;
} {
  return {
    id: input.eventId,
    type: input.eventType,
    orgId: input.orgId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    data: input.data,
  };
}

export function partnerDeliveryRetryDelayMs(attemptCount: number): number {
  // attemptCount is post-failure count (1-based after first fail)
  const base = 2_000;
  return Math.min(base * 2 ** Math.max(0, attemptCount - 1), 60_000);
}

export function applyOutboundDeliveryAttempt(
  attemptCount: number,
  success: boolean,
): {
  status: DeliveryStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  retryDelayMs: number | null;
} {
  const advanced = advanceDeliveryStatus(
    attemptCount === 0 ? "pending" : "retrying",
    attemptCount,
    success,
  );
  const retryDelayMs =
    advanced.status === "retrying"
      ? partnerDeliveryRetryDelayMs(advanced.attemptCount)
      : null;
  return {
    status: advanced.status,
    attemptCount: advanced.attemptCount,
    nextRetryAt: advanced.nextRetryAt,
    retryDelayMs,
  };
}

/**
 * Result of an outbound HTTP attempt.
 * Never marks delivered without a 2xx response from the remote.
 */
export type OutboundHttpResult = {
  ok: boolean;
  statusCode: number | null;
  detail: string;
};

export async function postSignedOutboundWebhook(input: {
  targetUrl: string;
  rawBody: string;
  signature: string;
  timestamp: string;
  fetchImpl?: typeof fetch;
}): Promise<OutboundHttpResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(input.targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-leadorbit-timestamp": input.timestamp,
        "x-leadorbit-signature": input.signature,
        "user-agent": "LeadOrbit-PartnerWebhooks/1.0",
      },
      body: input.rawBody,
    });
    if (res.status >= 200 && res.status < 300) {
      return {
        ok: true,
        statusCode: res.status,
        detail: "delivered",
      };
    }
    return {
      ok: false,
      statusCode: res.status,
      detail: `Remote responded HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      detail: err instanceof Error ? err.message : "Outbound request failed",
    };
  }
}
