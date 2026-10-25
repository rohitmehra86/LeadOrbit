import { jsonOk, jsonProblem } from "@/lib/api/http";
import { getBillingStore } from "@/lib/tenancy/billing";

/**
 * Stripe webhook adapter. Verifies signature, idempotent by event id.
 * Never activates subscriptions from client-side success callbacks.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("stripe-signature") ??
    request.headers.get("Stripe-Signature") ??
    "";

  let parsed: {
    id?: string;
    type?: string;
    data?: { object?: { metadata?: { orgId?: string }; id?: string } };
  };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return jsonProblem(400, "Invalid JSON");
  }

  const eventId = parsed.id;
  const eventType = parsed.type;
  if (!eventId || !eventType) {
    return jsonProblem(400, "Missing event id/type");
  }

  // Claimed orgId is a hint only — the store matches it to a stored checkout.
  const orgId = parsed.data?.object?.metadata?.orgId ?? null;
  const result = await Promise.resolve(
    getBillingStore().processVerifiedWebhook({
      provider: "stripe",
      eventId,
      eventType,
      orgId,
      rawBody,
      signatureHeader,
    }),
  );

  if (!result.accepted) {
    return jsonProblem(400, "Webhook rejected", result.detail);
  }

  return jsonOk({
    ok: true,
    duplicate: result.duplicate,
    detail: result.detail,
    subscriptionStatus: result.subscription?.status ?? null,
  });
}
