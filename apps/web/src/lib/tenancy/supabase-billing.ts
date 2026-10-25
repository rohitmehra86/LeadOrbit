import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError, getAuthMode, type SessionUser } from "@leadorbit/db";
import {
  DEFAULT_PLANS,
  USAGE_METRICS,
  applyAiCreditsIncrement,
  applyQuotaIncrement,
  attemptCheckoutSession,
  authorizeBillingProvider,
  canConsumeAiCredits,
  canConsumeQuota,
  createRazorpayCheckoutSession,
  createStripeCheckoutSession,
  defaultTrialUsageQuotas,
  featureAllowed,
  hasPermission,
  type BillingPlan,
  type BillingProvider,
  type Invoice,
  type InvoiceStatus,
  type OrgSubscription,
  type PlanInterval,
  type SubscriptionStatus,
} from "@leadorbit/domain";
import {
  verifyRazorpayWebhook,
  verifyStripeWebhook,
} from "@leadorbit/domain/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBillingWebhookHints } from "@/lib/tenancy/billing-webhook-parse";
import { isPublicRecordId } from "@/lib/tenancy/public-record-id";

function nowIso(): string {
  return new Date().toISOString();
}

function periodBounds(interval: PlanInterval): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start);
  if (interval === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

type SubRow = Record<string, unknown>;
type InvRow = Record<string, unknown>;

function mapSub(row: SubRow): OrgSubscription {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    planCode: String(row.plan_code),
    status: row.status as SubscriptionStatus,
    interval: row.interval as PlanInterval,
    seatsIncluded: Number(row.seats_included ?? 0),
    seatsUsed: Number(row.seats_used ?? 0),
    aiCreditsIncluded: Number(row.ai_credits_included ?? 0),
    aiCreditsUsed: Number(row.ai_credits_used ?? 0),
    usageQuotas:
      (row.usage_quotas as OrgSubscription["usageQuotas"]) ?? {},
    features: (row.features as Record<string, boolean>) ?? {},
    trialEndsAt: (row.trial_ends_at as string | null) ?? null,
    currentPeriodStart: String(row.current_period_start),
    currentPeriodEnd: String(row.current_period_end),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    graceEndsAt: (row.grace_ends_at as string | null) ?? null,
    provider: row.provider as BillingProvider,
    providerCustomerId: (row.provider_customer_id as string | null) ?? null,
    providerSubscriptionId:
      (row.provider_subscription_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapInv(row: InvRow): Invoice {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subscriptionId: (row.subscription_id as string | null) ?? null,
    number: String(row.number),
    status: row.status as InvoiceStatus,
    amountCents: Number(row.amount_cents ?? 0),
    currency: String(row.currency ?? "USD"),
    provider: row.provider as BillingProvider,
    providerInvoiceId: (row.provider_invoice_id as string | null) ?? null,
    hostedInvoiceUrl: (row.hosted_invoice_url as string | null) ?? null,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    paidAt: (row.paid_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapSubFromRpc(raw: unknown): OrgSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.id || !r.orgId) return null;
  return {
    id: String(r.id),
    orgId: String(r.orgId),
    planCode: String(r.planCode),
    status: r.status as SubscriptionStatus,
    interval: r.interval as PlanInterval,
    seatsIncluded: Number(r.seatsIncluded ?? 0),
    seatsUsed: Number(r.seatsUsed ?? 0),
    aiCreditsIncluded: Number(r.aiCreditsIncluded ?? 0),
    aiCreditsUsed: Number(r.aiCreditsUsed ?? 0),
    usageQuotas: (r.usageQuotas as OrgSubscription["usageQuotas"]) ?? {},
    features: (r.features as Record<string, boolean>) ?? {},
    trialEndsAt: (r.trialEndsAt as string | null) ?? null,
    currentPeriodStart: String(r.currentPeriodStart),
    currentPeriodEnd: String(r.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
    graceEndsAt: (r.graceEndsAt as string | null) ?? null,
    provider: r.provider as BillingProvider,
    providerCustomerId: (r.providerCustomerId as string | null) ?? null,
    providerSubscriptionId:
      (r.providerSubscriptionId as string | null) ?? null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  };
}

async function userClient(): Promise<SupabaseClient> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

/** Test seam — inject a fake admin client for webhook RPC tests. */
let adminClientOverride: SupabaseClient | null = null;

export function setSupabaseBillingAdminClientForTests(
  client: SupabaseClient | null,
): void {
  adminClientOverride = client;
}

function requireAdminClient(): SupabaseClient {
  if (adminClientOverride) return adminClientOverride;
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new AuthError(
      "SUPABASE_SERVICE_ROLE_KEY is required for billing webhooks in supabase mode",
      "validation",
    );
  }
  return admin;
}

/**
 * Durable billing for AUTH_MODE=supabase. Never touches SQLite.
 * Webhook activation goes through apply_billing_webhook (service role).
 */
export class SupabaseBillingStore {
  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "org:read" | "org:billing" | "platform:admin",
  ): Promise<void> {
    if (permission === "platform:admin") {
      if (!actor.isPlatformAdmin) {
        throw new AuthError("Platform admin required", "forbidden");
      }
      return;
    }
    if (actor.isPlatformAdmin) return;
    const supabase = await userClient();
    const { data, error } = await supabase
      .from("memberships")
      .select("role, status")
      .eq("org_id", orgId)
      .eq("user_id", actor.id)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    if (!data || data.status !== "active") {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
    if (!hasPermission(data.role as Parameters<typeof hasPermission>[0], permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  async listPlans(): Promise<BillingPlan[]> {
    const supabase = await userClient();
    const { data, error } = await supabase
      .from("billing_plans")
      .select("*")
      .eq("active", true)
      .order("price_cents", { ascending: true });
    if (error) throw new AuthError(error.message, "validation");
    const rows = (data ?? []) as SubRow[];
    if (!rows.length) return DEFAULT_PLANS.filter((p) => p.active);
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      interval: r.interval as PlanInterval,
      priceCents: Number(r.price_cents ?? 0),
      currency: String(r.currency ?? "USD"),
      seatsIncluded: Number(r.seats_included ?? 1),
      aiCreditsIncluded: Number(r.ai_credits_included ?? 0),
      features: (r.features as Record<string, boolean>) ?? {},
      active: Boolean(r.active),
    }));
  }

  private async getPlan(code: string): Promise<BillingPlan | null> {
    const plans = await this.listPlans();
    return plans.find((p) => p.code === code) ?? null;
  }

  async ensureTrialSubscription(orgId: string): Promise<OrgSubscription> {
    if (!isPublicRecordId(orgId)) {
      throw new AuthError("Invalid organization id", "validation");
    }
    const supabase = await userClient();
    const { data: existing, error: readErr } = await supabase
      .from("org_subscriptions")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    if (readErr) throw new AuthError(readErr.message, "validation");
    if (existing) return mapSub(existing as SubRow);

    const plan =
      (await this.getPlan("trial")) ??
      DEFAULT_PLANS.find((p) => p.code === "trial")!;
    const { start, end } = periodBounds("monthly");
    const trialEnd = new Date();
    trialEnd.setUTCDate(trialEnd.getUTCDate() + 14);
    const { data, error } = await supabase
      .from("org_subscriptions")
      .insert({
        org_id: orgId,
        plan_code: plan.code,
        status: "trialing",
        interval: plan.interval,
        seats_included: plan.seatsIncluded,
        seats_used: 1,
        ai_credits_included: plan.aiCreditsIncluded,
        ai_credits_used: 0,
        usage_quotas: defaultTrialUsageQuotas(),
        features: plan.features,
        trial_ends_at: trialEnd.toISOString(),
        current_period_start: start,
        current_period_end: end,
        cancel_at_period_end: false,
        provider: "manual",
      })
      .select("*")
      .single();
    if (error) {
      // Concurrent create — re-read.
      const { data: again, error: againErr } = await supabase
        .from("org_subscriptions")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (againErr || !again) throw new AuthError(error.message, "validation");
      return mapSub(again as SubRow);
    }
    return mapSub(data as SubRow);
  }

  async getSubscription(actor: SessionUser, orgId: string): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "org:read");
    return this.ensureTrialSubscription(orgId);
  }

  async listInvoices(actor: SessionUser, orgId: string): Promise<Invoice[]> {
    await this.gate(actor, orgId, "org:read");
    const supabase = await userClient();
    const { data, error } = await supabase
      .from("billing_invoices")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as InvRow[]).map(mapInv);
  }

  async providerStatus(actor: SessionUser, orgId: string) {
    await this.gate(actor, orgId, "org:read");
    return {
      stripe: authorizeBillingProvider("stripe"),
      razorpay: authorizeBillingProvider("razorpay"),
      manual: authorizeBillingProvider("manual"),
    };
  }

  async startCheckout(
    actor: SessionUser,
    orgId: string,
    input: { planCode: string; provider: BillingProvider },
  ): Promise<{
    status: string;
    checkoutUrl: string | null;
    detail: string;
    invoice: Invoice | null;
    setupHints?: string[];
  }> {
    await this.gate(actor, orgId, "org:billing");
    const plan = await this.getPlan(input.planCode);
    if (!plan) throw new AuthError("Unknown plan", "validation");

    const gate = attemptCheckoutSession({
      provider: input.provider,
      planCode: input.planCode,
    });

    let status = gate.status as string;
    let checkoutUrl: string | null = null;
    let detail = gate.detail;
    let setupHints: string[] | undefined;
    let providerInvoiceId: string | null = null;

    if (gate.status !== "pending_configuration") {
      if (input.provider === "stripe") {
        const live = await createStripeCheckoutSession({
          orgId,
          planCode: input.planCode,
          customerEmail: actor.email,
        });
        status = live.status;
        checkoutUrl = live.checkoutUrl;
        detail = live.detail;
        setupHints = live.setupHints;
        providerInvoiceId = live.providerSessionId;
      } else if (input.provider === "razorpay") {
        const live = await createRazorpayCheckoutSession({
          orgId,
          planCode: input.planCode,
          amountCents: plan.priceCents,
          currency: plan.currency === "USD" ? "INR" : plan.currency,
          customerEmail: actor.email,
          description: `LeadOrbit ${plan.name}`,
        });
        status = live.status;
        checkoutUrl = live.checkoutUrl;
        detail = live.detail;
        setupHints = live.setupHints;
        providerInvoiceId = live.providerSessionId;
      }
    }

    const sub = await this.ensureTrialSubscription(orgId);
    const supabase = await userClient();
    const now = nowIso();
    const number = `INV-${now.slice(0, 10)}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const invStatus: InvoiceStatus =
      status === "pending_configuration" || status === "error"
        ? "pending_configuration"
        : "open";

    const { data: inv, error: invErr } = await supabase
      .from("billing_invoices")
      .insert({
        org_id: orgId,
        subscription_id: sub.id,
        number,
        status: invStatus,
        amount_cents: plan.priceCents,
        currency: plan.currency,
        provider: input.provider,
        provider_invoice_id: providerInvoiceId,
        hosted_invoice_url: checkoutUrl,
        period_start: sub.currentPeriodStart,
        period_end: sub.currentPeriodEnd,
      })
      .select("*")
      .single();
    if (invErr) throw new AuthError(invErr.message, "validation");

    await supabase
      .from("org_subscriptions")
      .update({
        provider: input.provider,
        plan_code: input.planCode,
        status: sub.status === "active" ? "active" : "incomplete",
        updated_at: now,
      })
      .eq("org_id", orgId);

    return {
      status,
      checkoutUrl,
      detail,
      invoice: mapInv(inv as InvRow),
      setupHints,
    };
  }

  async changePlan(
    actor: SessionUser,
    orgId: string,
    planCode: string,
    mode: "upgrade" | "downgrade",
  ): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "org:billing");
    const plan = await this.getPlan(planCode);
    if (!plan) throw new AuthError("Unknown plan", "validation");
    const sub = await this.ensureTrialSubscription(orgId);
    const supabase = await userClient();
    const now = nowIso();
    const updates: Record<string, unknown> = {
      plan_code: plan.code,
      seats_included: plan.seatsIncluded,
      ai_credits_included: plan.aiCreditsIncluded,
      features: plan.features,
      interval: plan.interval,
      updated_at: now,
    };
    if (mode === "upgrade" && sub.status === "trialing") {
      updates.status = "incomplete";
    }
    const { data, error } = await supabase
      .from("org_subscriptions")
      .update(updates)
      .eq("org_id", orgId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapSub(data as SubRow);
  }

  async cancelSubscription(
    actor: SessionUser,
    orgId: string,
    atPeriodEnd = true,
  ): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "org:billing");
    await this.ensureTrialSubscription(orgId);
    const supabase = await userClient();
    const now = nowIso();
    const updates = atPeriodEnd
      ? { cancel_at_period_end: true, updated_at: now }
      : { status: "canceled", cancel_at_period_end: false, updated_at: now };
    const { data, error } = await supabase
      .from("org_subscriptions")
      .update(updates)
      .eq("org_id", orgId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapSub(data as SubRow);
  }

  /**
   * Verify signature in-process, then apply via Postgres RPC (idempotent).
   * Never activates from an unverified or unassociated claim alone.
   */
  async processVerifiedWebhook(input: {
    provider: "stripe" | "razorpay";
    eventId: string;
    eventType: string;
    orgId: string | null;
    rawBody: string;
    signatureHeader: string;
  }): Promise<{
    accepted: boolean;
    duplicate: boolean;
    detail: string;
    subscription: OrgSubscription | null;
  }> {
    if (getAuthMode() !== "supabase") {
      throw new AuthError(
        "SupabaseBillingStore.processVerifiedWebhook requires AUTH_MODE=supabase",
        "validation",
      );
    }

    const secret =
      input.provider === "stripe"
        ? process.env.STRIPE_WEBHOOK_SECRET
        : process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      return {
        accepted: false,
        duplicate: false,
        detail: `${input.provider} webhook secret not configured`,
        subscription: null,
      };
    }

    const verified =
      input.provider === "stripe"
        ? verifyStripeWebhook({
            rawBody: input.rawBody,
            signatureHeader: input.signatureHeader,
            secret,
          })
        : verifyRazorpayWebhook({
            rawBody: input.rawBody,
            signatureHeader: input.signatureHeader,
            secret,
          });

    if (!verified.ok) {
      return {
        accepted: false,
        duplicate: false,
        detail: verified.detail,
        subscription: null,
      };
    }

    const hints = parseBillingWebhookHints(input.provider, input.rawBody);
    const claimedOrgId =
      (input.orgId && isPublicRecordId(input.orgId) ? input.orgId : null) ??
      (hints.claimedOrgId && isPublicRecordId(hints.claimedOrgId)
        ? hints.claimedOrgId
        : null);

    let admin: SupabaseClient;
    try {
      admin = requireAdminClient();
    } catch (err) {
      return {
        accepted: false,
        duplicate: false,
        detail: err instanceof AuthError ? err.message : "admin client missing",
        subscription: null,
      };
    }

    const { data, error } = await admin.rpc("apply_billing_webhook", {
      p_provider: input.provider,
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_claimed_org_id: claimedOrgId,
      p_provider_ref: hints.providerRef,
    });

    if (error) {
      // Transient / migration missing — do not mark as accepted.
      return {
        accepted: false,
        duplicate: false,
        detail: error.message,
        subscription: null,
      };
    }

    const result = data as {
      accepted?: boolean;
      duplicate?: boolean;
      detail?: string;
      subscription?: unknown;
    };

    return {
      accepted: Boolean(result.accepted),
      duplicate: Boolean(result.duplicate),
      detail: String(result.detail ?? "ok"),
      subscription: mapSubFromRpc(result.subscription),
    };
  }

  /** Test helper: process with injected secret. */
  async processWebhookForTests(input: {
    provider: "stripe" | "razorpay";
    eventId: string;
    eventType: string;
    orgId: string;
    rawBody: string;
    signatureHeader: string;
    secret: string;
  }) {
    const key =
      input.provider === "stripe"
        ? "STRIPE_WEBHOOK_SECRET"
        : "RAZORPAY_WEBHOOK_SECRET";
    const prev = process.env[key];
    process.env[key] = input.secret;
    try {
      return await this.processVerifiedWebhook(input);
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }

  async requireFeature(orgId: string, feature: string): Promise<void> {
    const sub = await this.ensureTrialSubscription(orgId);
    if (sub.status === "canceled" || sub.status === "none") {
      throw new AuthError("Subscription inactive", "forbidden");
    }
    if (!featureAllowed(sub.features, feature)) {
      throw new AuthError(`Feature not entitled: ${feature}`, "forbidden");
    }
  }

  async consumeQuota(orgId: string, metric: string, increment = 1): Promise<void> {
    const sub = await this.ensureTrialSubscription(orgId);
    let q = sub.usageQuotas[metric];
    if (!q) {
      const defaults = defaultTrialUsageQuotas();
      q = defaults[metric];
      if (!q) return;
    }
    const check = canConsumeQuota(q, increment);
    if (!check.ok) {
      throw new AuthError(`Quota exceeded: ${metric}`, "forbidden");
    }
    const next = applyQuotaIncrement(q, increment);
    const quotas = { ...sub.usageQuotas, [metric]: next };
    const supabase = await userClient();
    const { error } = await supabase
      .from("org_subscriptions")
      .update({ usage_quotas: quotas, updated_at: nowIso() })
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
  }

  async consumeAiCredits(orgId: string, credits = 1): Promise<void> {
    const sub = await this.ensureTrialSubscription(orgId);
    const check = canConsumeAiCredits({
      included: sub.aiCreditsIncluded,
      used: sub.aiCreditsUsed,
      credits,
    });
    if (!check.ok) {
      throw new AuthError(check.reason, "forbidden");
    }
    await this.requireFeature(orgId, "ai");
    let q = sub.usageQuotas[USAGE_METRICS.aiJobs];
    if (q) {
      const qCheck = canConsumeQuota(q, 1);
      if (!qCheck.ok) throw new AuthError("Quota exceeded: ai_jobs", "forbidden");
    }
    const used = applyAiCreditsIncrement(sub.aiCreditsUsed, credits);
    const quotas = { ...sub.usageQuotas };
    if (q) quotas[USAGE_METRICS.aiJobs] = applyQuotaIncrement(q, 1);
    const supabase = await userClient();
    const { error } = await supabase
      .from("org_subscriptions")
      .update({
        ai_credits_used: used,
        usage_quotas: quotas,
        updated_at: nowIso(),
      })
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
  }

  async assertEntitled(
    actor: SessionUser,
    orgId: string,
    feature: string,
  ): Promise<{ allowed: boolean; subscription: OrgSubscription }> {
    await this.gate(actor, orgId, "org:read");
    const sub = await this.ensureTrialSubscription(orgId);
    const inactive = sub.status === "canceled" || sub.status === "none";
    return {
      allowed: !inactive && featureAllowed(sub.features, feature),
      subscription: sub,
    };
  }

  async platformUsageSummary(actor: SessionUser) {
    await this.gate(actor, "", "platform:admin");
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("org_subscriptions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as SubRow[]).map((r) => {
      const sub = mapSub(r);
      return {
        orgId: sub.orgId,
        planCode: sub.planCode,
        status: sub.status,
        aiCreditsUsed: sub.aiCreditsUsed,
        aiCreditsIncluded: sub.aiCreditsIncluded,
        usageQuotas: sub.usageQuotas,
      };
    });
  }

  async platformSetSubscription(
    actor: SessionUser,
    orgId: string,
    patch: {
      planCode?: string;
      status?: SubscriptionStatus;
      seatsIncluded?: number;
      aiCreditsIncluded?: number;
    },
  ): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "platform:admin");
    await this.ensureTrialSubscription(orgId);
    const plan = patch.planCode ? await this.getPlan(patch.planCode) : null;
    const admin = requireAdminClient();
    const updates: Record<string, unknown> = { updated_at: nowIso() };
    if (patch.planCode !== undefined) updates.plan_code = patch.planCode;
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.seatsIncluded !== undefined) updates.seats_included = patch.seatsIncluded;
    else if (plan) updates.seats_included = plan.seatsIncluded;
    if (patch.aiCreditsIncluded !== undefined) {
      updates.ai_credits_included = patch.aiCreditsIncluded;
    } else if (plan) {
      updates.ai_credits_included = plan.aiCreditsIncluded;
    }
    if (plan) {
      updates.features = plan.features;
      updates.interval = plan.interval;
    }
    const { data, error } = await admin
      .from("org_subscriptions")
      .update(updates)
      .eq("org_id", orgId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapSub(data as SubRow);
  }

  async listWebhookEvents(orgId?: string) {
    const admin = requireAdminClient();
    let query = admin
      .from("billing_webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (orgId) query = query.eq("org_id", orgId);
    const { data, error } = await query;
    if (error) throw new AuthError(error.message, "validation");
    return data ?? [];
  }
}

let singleton: SupabaseBillingStore | null = null;
export function getSupabaseBillingStore(): SupabaseBillingStore {
  if (!singleton) singleton = new SupabaseBillingStore();
  return singleton;
}

/** Test helper — reset singleton between cases. */
export function resetSupabaseBillingStoreForTests(): void {
  singleton = null;
  adminClientOverride = null;
}
