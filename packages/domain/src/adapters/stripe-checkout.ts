/**
 * Stripe Checkout Session adapter.
 * Never activates subscriptions from client success — webhook only.
 * Without keys / price ids → pending_configuration or session_scaffolded (no fake URL).
 */

import {
  authorizeBillingProvider,
  billingCredentialsPresent,
  type BillingProvider,
} from "../billing";

export type StripeCheckoutResult = {
  status:
    | "pending_configuration"
    | "session_scaffolded"
    | "session_created"
    | "error";
  checkoutUrl: string | null;
  providerSessionId: string | null;
  detail: string;
  setupHints: string[];
};

const STRIPE_PRICE_ENV: Record<string, string> = {
  starter_monthly: "STRIPE_PRICE_STARTER_MONTHLY",
  growth_monthly: "STRIPE_PRICE_GROWTH_MONTHLY",
  growth_annual: "STRIPE_PRICE_GROWTH_ANNUAL",
};

export function stripeCheckoutSetupHints(): string[] {
  return [
    "Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET",
    "Set STRIPE_PRICE_STARTER_MONTHLY / STRIPE_PRICE_GROWTH_MONTHLY / STRIPE_PRICE_GROWTH_ANNUAL",
    "Optional: BILLING_SUCCESS_URL + BILLING_CANCEL_URL",
    "Activate only via verified Stripe webhooks — never client success",
  ];
}

export function stripePriceIdForPlan(planCode: string): string | null {
  const envKey = STRIPE_PRICE_ENV[planCode];
  if (!envKey) return null;
  const value = process.env[envKey]?.trim();
  return value || null;
}

function defaultReturnUrls(orgId: string): { success: string; cancel: string } {
  const base =
    process.env.BILLING_SUCCESS_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:43127";
  const success =
    process.env.BILLING_SUCCESS_URL ||
    `${base}/app/orgs/${orgId}/billing?checkout=return`;
  const cancel =
    process.env.BILLING_CANCEL_URL ||
    `${base}/app/orgs/${orgId}/billing?checkout=cancel`;
  return { success, cancel };
}

/**
 * Create a Stripe Checkout Session when credentials + price id are present.
 * Does not mark the org subscription active.
 */
export async function createStripeCheckoutSession(input: {
  orgId: string;
  planCode: string;
  customerEmail?: string | null;
  successUrl?: string;
  cancelUrl?: string;
  /** Injected fetch for tests */
  fetchImpl?: typeof fetch;
}): Promise<StripeCheckoutResult> {
  const hints = stripeCheckoutSetupHints();
  const auth = authorizeBillingProvider("stripe" satisfies BillingProvider);
  if (auth.status === "pending_configuration" || !billingCredentialsPresent("stripe")) {
    return {
      status: "pending_configuration",
      checkoutUrl: null,
      providerSessionId: null,
      detail: auth.detail,
      setupHints: hints,
    };
  }

  const priceId = stripePriceIdForPlan(input.planCode);
  if (!priceId) {
    return {
      status: "session_scaffolded",
      checkoutUrl: null,
      providerSessionId: null,
      detail: `Stripe credentials present but no price id for plan ${input.planCode} — set ${STRIPE_PRICE_ENV[input.planCode] ?? "STRIPE_PRICE_*"}`,
      setupHints: hints,
    };
  }

  const urls = defaultReturnUrls(input.orgId);
  const successUrl = input.successUrl ?? urls.success;
  const cancelUrl = input.cancelUrl ?? urls.cancel;
  const secret = process.env.STRIPE_SECRET_KEY!;
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("client_reference_id", input.orgId);
  body.set("metadata[orgId]", input.orgId);
  body.set("metadata[planCode]", input.planCode);
  body.set("subscription_data[metadata][orgId]", input.orgId);
  body.set("subscription_data[metadata][planCode]", input.planCode);
  if (input.customerEmail) body.set("customer_email", input.customerEmail);

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || !json.url || !json.id) {
      return {
        status: "error",
        checkoutUrl: null,
        providerSessionId: json.id ?? null,
        detail: json.error?.message ?? `Stripe Checkout HTTP ${res.status}`,
        setupHints: hints,
      };
    }
    return {
      status: "session_created",
      checkoutUrl: json.url,
      providerSessionId: json.id,
      detail:
        "Stripe Checkout session created — subscription activates only via verified webhook",
      setupHints: hints,
    };
  } catch (err) {
    return {
      status: "error",
      checkoutUrl: null,
      providerSessionId: null,
      detail: err instanceof Error ? err.message : "Stripe Checkout request failed",
      setupHints: hints,
    };
  }
}
