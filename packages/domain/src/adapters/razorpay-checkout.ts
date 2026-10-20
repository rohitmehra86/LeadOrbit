/**
 * Razorpay Payment Link / order adapter.
 * Never activates subscriptions from client success — webhook only.
 * Without keys → pending_configuration. No fake payment success URLs.
 */

import {
  authorizeBillingProvider,
  billingCredentialsPresent,
  type BillingProvider,
} from "../billing";

export type RazorpayCheckoutResult = {
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

export function razorpayCheckoutSetupHints(): string[] {
  return [
    "Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET + RAZORPAY_WEBHOOK_SECRET",
    "Optional: BILLING_SUCCESS_URL + BILLING_CANCEL_URL for payment link callbacks",
    "Put orgId in notes — webhooks activate only after signature verify",
    "Never treat client checkout.success as activation",
  ];
}

function defaultCallbackUrl(orgId: string): string {
  const base =
    process.env.BILLING_SUCCESS_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:43127";
  return (
    process.env.BILLING_SUCCESS_URL ||
    `${base}/app/orgs/${orgId}/billing?checkout=return`
  );
}

/**
 * Create a Razorpay payment link when credentials are present.
 * Amount/currency come from the plan; activation remains webhook-only.
 */
export async function createRazorpayCheckoutSession(input: {
  orgId: string;
  planCode: string;
  amountCents: number;
  currency: string;
  customerEmail?: string | null;
  description?: string;
  /** Injected fetch for tests */
  fetchImpl?: typeof fetch;
}): Promise<RazorpayCheckoutResult> {
  const hints = razorpayCheckoutSetupHints();
  const auth = authorizeBillingProvider("razorpay" satisfies BillingProvider);
  if (
    auth.status === "pending_configuration" ||
    !billingCredentialsPresent("razorpay")
  ) {
    return {
      status: "pending_configuration",
      checkoutUrl: null,
      providerSessionId: null,
      detail: auth.detail,
      setupHints: hints,
    };
  }

  if (input.amountCents <= 0) {
    return {
      status: "session_scaffolded",
      checkoutUrl: null,
      providerSessionId: null,
      detail: "Razorpay checkout scaffolded — plan has zero amount (use trial/manual)",
      setupHints: hints,
    };
  }

  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  // Avoid Buffer so this adapter stays safe if pulled into a Next client graph.
  const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
  const currency = (input.currency || "INR").toUpperCase();
  // Razorpay amounts are in the smallest currency unit.
  const payload = {
    amount: input.amountCents,
    currency,
    accept_partial: false,
    description: input.description ?? `LeadOrbit ${input.planCode}`,
    customer: input.customerEmail
      ? { email: input.customerEmail }
      : undefined,
    notify: { email: Boolean(input.customerEmail), sms: false },
    reminder_enable: false,
    callback_url: defaultCallbackUrl(input.orgId),
    callback_method: "get",
    notes: {
      orgId: input.orgId,
      planCode: input.planCode,
    },
  };

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      id?: string;
      short_url?: string;
      error?: { description?: string; code?: string };
    };
    if (!res.ok || !json.short_url || !json.id) {
      return {
        status: "error",
        checkoutUrl: null,
        providerSessionId: json.id ?? null,
        detail:
          json.error?.description ?? `Razorpay payment link HTTP ${res.status}`,
        setupHints: hints,
      };
    }
    return {
      status: "session_created",
      checkoutUrl: json.short_url,
      providerSessionId: json.id,
      detail:
        "Razorpay payment link created — subscription activates only via verified webhook",
      setupHints: hints,
    };
  } catch (err) {
    return {
      status: "error",
      checkoutUrl: null,
      providerSessionId: null,
      detail:
        err instanceof Error ? err.message : "Razorpay payment link request failed",
      setupHints: hints,
    };
  }
}
