import { jsonOk, jsonProblem } from "@/lib/api/http";
import { getPartnerWebhookStore } from "@/lib/tenancy/partner-webhooks";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * Inbound partner webhook (Zapier/n8n → LeadOrbit).
 * Requires x-leadorbit-timestamp + x-leadorbit-signature. Idempotent by event id.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { orgId } = await ctx.params;
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-leadorbit-signature") ??
    request.headers.get("X-LeadOrbit-Signature") ??
    "";
  const timestamp =
    request.headers.get("x-leadorbit-timestamp") ??
    request.headers.get("X-LeadOrbit-Timestamp") ??
    "";
  const partner =
    request.headers.get("x-leadorbit-partner") ??
    request.headers.get("X-LeadOrbit-Partner") ??
    "partner";
  const eventIdHeader =
    request.headers.get("x-leadorbit-event-id") ??
    request.headers.get("X-LeadOrbit-Event-Id");
  const eventTypeHeader =
    request.headers.get("x-leadorbit-event-type") ??
    request.headers.get("X-LeadOrbit-Event-Type") ??
    "partner.inbound";

  let parsed: { id?: string; type?: string } = {};
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    // raw accepted if signature verifies
  }
  const eventId = eventIdHeader || parsed.id;
  if (!eventId) {
    return jsonProblem(400, "Missing event id");
  }

  const result = getPartnerWebhookStore().processInboundWebhook({
    orgId,
    partner,
    eventId,
    eventType: eventTypeHeader || parsed.type || "partner.inbound",
    rawBody,
    timestamp,
    signature,
  });

  if (!result.accepted) {
    return jsonProblem(400, "Webhook rejected", result.detail);
  }

  return jsonOk({
    ok: true,
    duplicate: result.duplicate,
    detail: result.detail,
    eventId: result.event?.eventId ?? eventId,
  });
}
