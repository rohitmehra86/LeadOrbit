/**
 * Extract association hints from verified Stripe/Razorpay webhook JSON.
 * These values are untrusted until matched against a stored checkout invoice
 * or an in-flight subscription for the same provider.
 */

export type BillingWebhookHints = {
  claimedOrgId: string | null;
  providerRef: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Stripe: session id / subscription id / client_reference_id / metadata.orgId */
export function parseStripeWebhookHints(rawBody: string): BillingWebhookHints {
  try {
    const root = asRecord(JSON.parse(rawBody));
    if (!root) return { claimedOrgId: null, providerRef: null };
    const data = asRecord(root.data);
    const object = asRecord(data?.object);
    const metadata = asRecord(object?.metadata);
    const claimedOrgId = readString(
      metadata?.orgId,
      metadata?.org_id,
      object?.client_reference_id,
    );
    const providerRef = readString(
      object?.id,
      object?.checkout_session,
      root.id,
    );
    return { claimedOrgId, providerRef };
  } catch {
    return { claimedOrgId: null, providerRef: null };
  }
}

/** Razorpay: payment notes.orgId and payment/order entity id */
export function parseRazorpayWebhookHints(rawBody: string): BillingWebhookHints {
  try {
    const root = asRecord(JSON.parse(rawBody));
    if (!root) return { claimedOrgId: null, providerRef: null };
    const payload = asRecord(root.payload);
    const payment = asRecord(payload?.payment);
    const order = asRecord(payload?.order);
    const paymentEntity = asRecord(payment?.entity);
    const orderEntity = asRecord(order?.entity);
    const notes = asRecord(paymentEntity?.notes) ?? asRecord(orderEntity?.notes);
    const claimedOrgId = readString(notes?.orgId, notes?.org_id);
    const providerRef = readString(
      paymentEntity?.id,
      orderEntity?.id,
      paymentEntity?.order_id,
      root.id,
    );
    return { claimedOrgId, providerRef };
  } catch {
    return { claimedOrgId: null, providerRef: null };
  }
}

export function parseBillingWebhookHints(
  provider: "stripe" | "razorpay",
  rawBody: string,
): BillingWebhookHints {
  return provider === "stripe"
    ? parseStripeWebhookHints(rawBody)
    : parseRazorpayWebhookHints(rawBody);
}
