/**
 * Milestone 10 — billing / subscriptions.
 * Never store raw cards. Never activate from client-only success.
 * Stripe/Razorpay: pending_configuration without credentials.
 */

export type BillingProvider = "stripe" | "razorpay" | "manual";

export type PlanInterval = "monthly" | "annual";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "grace"
  | "canceled"
  | "incomplete"
  | "none";

export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible"
  | "pending_configuration";

export type PaymentProviderStatus =
  | "pending_configuration"
  | "authorized_stub"
  | "ready"
  | "error";

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  interval: PlanInterval;
  priceCents: number;
  currency: string;
  seatsIncluded: number;
  aiCreditsIncluded: number;
  features: Record<string, boolean>;
  active: boolean;
}

export interface OrgSubscription {
  id: string;
  orgId: string;
  planCode: string;
  status: SubscriptionStatus;
  interval: PlanInterval;
  seatsIncluded: number;
  seatsUsed: number;
  aiCreditsIncluded: number;
  aiCreditsUsed: number;
  usageQuotas: Record<string, { limit: number; used: number }>;
  features: Record<string, boolean>;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: string | null;
  provider: BillingProvider;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  orgId: string;
  subscriptionId: string | null;
  number: string;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  provider: BillingProvider;
  providerInvoiceId: string | null;
  hostedInvoiceUrl: string | null;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  createdAt: string;
}

export interface BillingWebhookEvent {
  id: string;
  provider: BillingProvider;
  eventId: string;
  eventType: string;
  orgId: string | null;
  processed: boolean;
  detail: string;
  createdAt: string;
}

export const DEFAULT_PLANS: BillingPlan[] = [
  {
    id: "plan_trial",
    code: "trial",
    name: "Trial",
    interval: "monthly",
    priceCents: 0,
    currency: "USD",
    seatsIncluded: 3,
    aiCreditsIncluded: 500,
    features: {
      crm: true,
      campaigns: true,
      workflows: true,
      inbox: true,
      ai: true,
      analytics: true,
      white_label: false,
      real_estate: false,
      voice: false,
    },
    active: true,
  },
  {
    id: "plan_starter_m",
    code: "starter_monthly",
    name: "Starter",
    interval: "monthly",
    priceCents: 4900,
    currency: "USD",
    seatsIncluded: 5,
    aiCreditsIncluded: 2000,
    features: {
      crm: true,
      campaigns: true,
      workflows: true,
      inbox: true,
      ai: true,
      analytics: true,
      white_label: false,
      real_estate: true,
      voice: false,
    },
    active: true,
  },
  {
    id: "plan_growth_m",
    code: "growth_monthly",
    name: "Growth",
    interval: "monthly",
    priceCents: 14900,
    currency: "USD",
    seatsIncluded: 20,
    aiCreditsIncluded: 10000,
    features: {
      crm: true,
      campaigns: true,
      workflows: true,
      inbox: true,
      ai: true,
      analytics: true,
      white_label: true,
      real_estate: true,
      voice: true,
    },
    active: true,
  },
  {
    id: "plan_growth_a",
    code: "growth_annual",
    name: "Growth (Annual)",
    interval: "annual",
    priceCents: 149000,
    currency: "USD",
    seatsIncluded: 20,
    aiCreditsIncluded: 120000,
    features: {
      crm: true,
      campaigns: true,
      workflows: true,
      inbox: true,
      ai: true,
      analytics: true,
      white_label: true,
      real_estate: true,
      voice: true,
    },
    active: true,
  },
];

export function billingCredentialsPresent(provider: BillingProvider): boolean {
  if (provider === "stripe") {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  }
  if (provider === "razorpay") {
    return Boolean(
      process.env.RAZORPAY_KEY_ID &&
        process.env.RAZORPAY_KEY_SECRET &&
        process.env.RAZORPAY_WEBHOOK_SECRET,
    );
  }
  return true; // manual
}

export function authorizeBillingProvider(provider: BillingProvider): {
  status: PaymentProviderStatus;
  detail: string;
} {
  if (provider === "manual") {
    return { status: "ready", detail: "Manual / internal billing" };
  }
  if (!billingCredentialsPresent(provider)) {
    return {
      status: "pending_configuration",
      detail: `${provider} credentials not configured`,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${provider} credentials present but live charge path not verified`,
  };
}

/**
 * Checkout / activate attempt — never returns activated from client success alone.
 * Without provider credentials → pending_configuration.
 */
export function attemptCheckoutSession(input: {
  provider: BillingProvider;
  planCode: string;
}): {
  status: "pending_configuration" | "session_scaffolded";
  checkoutUrl: string | null;
  detail: string;
} {
  const auth = authorizeBillingProvider(input.provider);
  if (auth.status === "pending_configuration") {
    return {
      status: "pending_configuration",
      checkoutUrl: null,
      detail: auth.detail,
    };
  }
  return {
    status: "session_scaffolded",
    checkoutUrl: null,
    detail:
      "Checkout session scaffolded — subscription activates only via verified webhook, not client success",
  };
}

export function featureAllowed(
  features: Record<string, boolean> | null | undefined,
  feature: string,
): boolean {
  if (!features) return false;
  return Boolean(features[feature]);
}

export function quotaExceeded(
  used: number,
  limit: number,
): boolean {
  if (limit < 0) return false; // unlimited
  return used >= limit;
}
