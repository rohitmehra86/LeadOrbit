import { jsonOk, jsonProblem } from "@/lib/api/http";
import { getBillingStore } from "@/lib/tenancy/billing";

/**
 * Razorpay webhook adapter. HMAC verification + idempotent event storage.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("x-razorpay-signature") ??
    request.headers.get("X-Razorpay-Signature") ??
    "";

  let parsed: {
    event?: string;
    id?: string;
    payload?: { payment?: { entity?: { notes?: { orgId?: string } } } };
  };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return jsonProblem(400, "Invalid JSON");
  }

  const eventId = parsed.id ?? `rzp_${Buffer.from(rawBody).toString("base64url").slice(0, 24)}`;
  const eventType = parsed.event ?? "unknown";
  const orgId = parsed.payload?.payment?.entity?.notes?.orgId ?? null;

  const result = await Promise.resolve(
    getBillingStore().processVerifiedWebhook({
      provider: "razorpay",
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
