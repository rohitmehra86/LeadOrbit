import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_PLANS,
  attemptCheckoutSession,
  authorizeBillingProvider,
  featureAllowed,
  hasPermission,
  quotaExceeded,
  type BillingPlan,
  type BillingProvider,
  type Invoice,
  type InvoiceStatus,
  type OrgSubscription,
  type PlanInterval,
  type SubscriptionStatus
} from "@leadorbit/domain";
import {
  verifyRazorpayWebhook,
  verifyStripeWebhook
} from "@leadorbit/domain/server";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";

function nowIso(): string {
  return new Date().toISOString();
}

function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function periodBounds(interval: PlanInterval): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start);
  if (interval === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

type SubRow = {
  id: string;
  org_id: string;
  plan_code: string;
  status: string;
  interval: string;
  seats_included: number;
  seats_used: number;
  ai_credits_included: number;
  ai_credits_used: number;
  usage_quotas: string;
  features: string;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  grace_ends_at: string | null;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

type InvRow = {
  id: string;
  org_id: string;
  subscription_id: string | null;
  number: string;
  status: string;
  amount_cents: number;
  currency: string;
  provider: string;
  provider_invoice_id: string | null;
  hosted_invoice_url: string | null;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
};

/**
 * Billing / subscriptions. Activation only via verified webhooks.
 * Never stores raw cards. Without provider credentials → pending_configuration.
 */
export class BillingStore {
  private plansSeeded = false;

  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
  ) {}

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
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private ensurePlans(): void {
    if (this.plansSeeded) return;
    for (const p of DEFAULT_PLANS) {
      this.db
        .prepare(
          `insert into billing_plans(
            id, code, name, interval, price_cents, currency,
            seats_included, ai_credits_included, features, active
          ) values (?,?,?,?,?,?,?,?,?,?)
          on conflict(code) do nothing`,
        )
        .run(
          p.id,
          p.code,
          p.name,
          p.interval,
          p.priceCents,
          p.currency,
          p.seatsIncluded,
          p.aiCreditsIncluded,
          JSON.stringify(p.features),
          p.active ? 1 : 0,
        );
    }
    this.plansSeeded = true;
  }

  private mapSub(row: SubRow): OrgSubscription {
    return {
      id: row.id,
      orgId: row.org_id,
      planCode: row.plan_code,
      status: row.status as SubscriptionStatus,
      interval: row.interval as PlanInterval,
      seatsIncluded: row.seats_included,
      seatsUsed: row.seats_used,
      aiCreditsIncluded: row.ai_credits_included,
      aiCreditsUsed: row.ai_credits_used,
      usageQuotas: jparse(row.usage_quotas, {}),
      features: jparse(row.features, {}),
      trialEndsAt: row.trial_ends_at,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      graceEndsAt: row.grace_ends_at,
      provider: row.provider as BillingProvider,
      providerCustomerId: row.provider_customer_id,
      providerSubscriptionId: row.provider_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapInv(row: InvRow): Invoice {
    return {
      id: row.id,
      orgId: row.org_id,
      subscriptionId: row.subscription_id,
      number: row.number,
      status: row.status as InvoiceStatus,
      amountCents: row.amount_cents,
      currency: row.currency,
      provider: row.provider as BillingProvider,
      providerInvoiceId: row.provider_invoice_id,
      hostedInvoiceUrl: row.hosted_invoice_url,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }

  listPlans(): BillingPlan[] {
    this.ensurePlans();
    const rows = this.db
      .prepare(`select * from billing_plans where active=1 order by price_cents`)
      .all() as Array<{
      id: string;
      code: string;
      name: string;
      interval: string;
      price_cents: number;
      currency: string;
      seats_included: number;
      ai_credits_included: number;
      features: string;
      active: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      interval: r.interval as PlanInterval,
      priceCents: r.price_cents,
      currency: r.currency,
      seatsIncluded: r.seats_included,
      aiCreditsIncluded: r.ai_credits_included,
      features: jparse(r.features, {}),
      active: Boolean(r.active),
    }));
  }

  private getPlan(code: string): BillingPlan | null {
    return this.listPlans().find((p) => p.code === code) ?? null;
  }

  ensureTrialSubscription(orgId: string): OrgSubscription {
    this.ensurePlans();
    const existing = this.db
      .prepare(`select * from org_subscriptions where org_id=?`)
      .get(orgId) as SubRow | undefined;
    if (existing) return this.mapSub(existing);

    const plan = this.getPlan("trial")!;
    const { start, end } = periodBounds("monthly");
    const trialEnd = new Date();
    trialEnd.setUTCDate(trialEnd.getUTCDate() + 14);
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into org_subscriptions(
          id, org_id, plan_code, status, interval, seats_included, seats_used,
          ai_credits_included, ai_credits_used, usage_quotas, features,
          trial_ends_at, current_period_start, current_period_end,
          cancel_at_period_end, grace_ends_at, provider,
          provider_customer_id, provider_subscription_id, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,null,'manual',null,null,?,?)`,
      )
      .run(
        id,
        orgId,
        plan.code,
        "trialing",
        plan.interval,
        plan.seatsIncluded,
        1,
        plan.aiCreditsIncluded,
        0,
        JSON.stringify({
          leads_created: { limit: 1000, used: 0 },
          messages_sent: { limit: 500, used: 0 },
        }),
        JSON.stringify(plan.features),
        trialEnd.toISOString(),
        start,
        end,
        now,
        now,
      );
    return this.mapSub(
      this.db.prepare(`select * from org_subscriptions where id=?`).get(id) as SubRow,
    );
  }

  async getSubscription(actor: SessionUser, orgId: string): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "org:read");
    return this.ensureTrialSubscription(orgId);
  }

  async listInvoices(actor: SessionUser, orgId: string): Promise<Invoice[]> {
    await this.gate(actor, orgId, "org:read");
    const rows = this.db
      .prepare(
        `select * from billing_invoices where org_id=? order by created_at desc`,
      )
      .all(orgId) as InvRow[];
    return rows.map((r) => this.mapInv(r));
  }

  async providerStatus(actor: SessionUser, orgId: string) {
    await this.gate(actor, orgId, "org:read");
    return {
      stripe: authorizeBillingProvider("stripe"),
      razorpay: authorizeBillingProvider("razorpay"),
      manual: authorizeBillingProvider("manual"),
    };
  }

  /**
   * Checkout / upgrade attempt. Never activates subscription from this path.
   */
  async startCheckout(
    actor: SessionUser,
    orgId: string,
    input: { planCode: string; provider: BillingProvider },
  ): Promise<{
    status: string;
    checkoutUrl: string | null;
    detail: string;
    invoice: Invoice | null;
  }> {
    await this.gate(actor, orgId, "org:billing");
    const plan = this.getPlan(input.planCode);
    if (!plan) throw new AuthError("Unknown plan", "validation");

    const attempt = attemptCheckoutSession({
      provider: input.provider,
      planCode: input.planCode,
    });

    const sub = this.ensureTrialSubscription(orgId);
    const invId = randomUUID();
    const now = nowIso();
    const number = `INV-${now.slice(0, 10)}-${invId.slice(0, 6).toUpperCase()}`;
    const invStatus: InvoiceStatus =
      attempt.status === "pending_configuration"
        ? "pending_configuration"
        : "open";

    this.db
      .prepare(
        `insert into billing_invoices(
          id, org_id, subscription_id, number, status, amount_cents, currency,
          provider, provider_invoice_id, hosted_invoice_url,
          period_start, period_end, paid_at, created_at
        ) values (?,?,?,?,?,?,?,?,null,null,?,?,null,?)`,
      )
      .run(
        invId,
        orgId,
        sub.id,
        number,
        invStatus,
        plan.priceCents,
        plan.currency,
        input.provider,
        sub.currentPeriodStart,
        sub.currentPeriodEnd,
        now,
      );

    // Store intended plan on subscription metadata via features update? Keep status; webhook activates.
    this.db
      .prepare(
        `update org_subscriptions set provider=?, updated_at=? where org_id=?`,
      )
      .run(input.provider, now, orgId);

    const invoice = this.mapInv(
      this.db.prepare(`select * from billing_invoices where id=?`).get(invId) as InvRow,
    );

    return {
      status: attempt.status,
      checkoutUrl: attempt.checkoutUrl,
      detail: attempt.detail,
      invoice,
    };
  }

  async changePlan(
    actor: SessionUser,
    orgId: string,
    planCode: string,
    mode: "upgrade" | "downgrade",
  ): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "org:billing");
    const plan = this.getPlan(planCode);
    if (!plan) throw new AuthError("Unknown plan", "validation");
    const sub = this.ensureTrialSubscription(orgId);
    const now = nowIso();
    // Downgrades take effect at period end; upgrades apply features immediately but stay incomplete until paid webhook.
    if (mode === "downgrade") {
      this.db
        .prepare(
          `update org_subscriptions set plan_code=?, cancel_at_period_end=0,
           seats_included=?, ai_credits_included=?, features=?, interval=?, updated_at=?
           where org_id=?`,
        )
        .run(
          plan.code,
          plan.seatsIncluded,
          plan.aiCreditsIncluded,
          JSON.stringify(plan.features),
          plan.interval,
          now,
          orgId,
        );
    } else {
      this.db
        .prepare(
          `update org_subscriptions set plan_code=?, status=case when status='trialing' then 'incomplete' else status end,
           seats_included=?, ai_credits_included=?, features=?, interval=?, updated_at=?
           where org_id=?`,
        )
        .run(
          plan.code,
          plan.seatsIncluded,
          plan.aiCreditsIncluded,
          JSON.stringify(plan.features),
          plan.interval,
          now,
          orgId,
        );
    }
    void mode;
    return this.mapSub(
      this.db.prepare(`select * from org_subscriptions where org_id=?`).get(orgId) as SubRow,
    );
  }

  async cancelSubscription(
    actor: SessionUser,
    orgId: string,
    atPeriodEnd = true,
  ): Promise<OrgSubscription> {
    await this.gate(actor, orgId, "org:billing");
    this.ensureTrialSubscription(orgId);
    const now = nowIso();
    if (atPeriodEnd) {
      this.db
        .prepare(
          `update org_subscriptions set cancel_at_period_end=1, updated_at=? where org_id=?`,
        )
        .run(now, orgId);
    } else {
      this.db
        .prepare(
          `update org_subscriptions set status='canceled', cancel_at_period_end=0, updated_at=? where org_id=?`,
        )
        .run(now, orgId);
    }
    return this.mapSub(
      this.db.prepare(`select * from org_subscriptions where org_id=?`).get(orgId) as SubRow,
    );
  }

  /**
   * Idempotent webhook processing. Returns duplicate:true if event_id already seen.
   * Client-only success must never call this without a verified signature.
   */
  processVerifiedWebhook(input: {
    provider: "stripe" | "razorpay";
    eventId: string;
    eventType: string;
    orgId: string | null;
    rawBody: string;
    signatureHeader: string;
  }): {
    accepted: boolean;
    duplicate: boolean;
    detail: string;
    subscription: OrgSubscription | null;
  } {
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

    const existing = this.db
      .prepare(
        `select id, processed from billing_webhook_events where provider=? and event_id=?`,
      )
      .get(input.provider, input.eventId) as
      | { id: string; processed: number }
      | undefined;

    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        detail: "Webhook already processed (idempotent)",
        subscription: input.orgId
          ? this.mapSub(
              this.db
                .prepare(`select * from org_subscriptions where org_id=?`)
                .get(input.orgId) as SubRow,
            )
          : null,
      };
    }

    const whId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into billing_webhook_events(
          id, provider, event_id, event_type, org_id, processed, detail, created_at
        ) values (?,?,?,?,?,1,?,?)`,
      )
      .run(
        whId,
        input.provider,
        input.eventId,
        input.eventType,
        input.orgId,
        "processed",
        now,
      );

    let subscription: OrgSubscription | null = null;
    if (input.orgId) {
      subscription = this.applyWebhookEffect(input.orgId, input.eventType, now);
    }

    return {
      accepted: true,
      duplicate: false,
      detail: "ok",
      subscription,
    };
  }

  /** Test helper: process with injected secret (sets env briefly). */
  processWebhookForTests(input: {
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
      return this.processVerifiedWebhook(input);
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }

  private applyWebhookEffect(
    orgId: string,
    eventType: string,
    now: string,
  ): OrgSubscription {
    this.ensureTrialSubscription(orgId);
    const t = eventType.toLowerCase();

    if (
      t.includes("invoice.paid") ||
      t.includes("payment.captured") ||
      t.includes("subscription.activated") ||
      t.includes("checkout.session.completed")
    ) {
      this.db
        .prepare(
          `update org_subscriptions set status='active', cancel_at_period_end=0,
           grace_ends_at=null, updated_at=? where org_id=?`,
        )
        .run(now, orgId);
      this.db
        .prepare(
          `update billing_invoices set status='paid', paid_at=?
           where org_id=? and status in ('open','pending_configuration')`,
        )
        .run(now, orgId);
    } else if (
      t.includes("invoice.payment_failed") ||
      t.includes("payment.failed")
    ) {
      const grace = new Date();
      grace.setUTCDate(grace.getUTCDate() + 7);
      this.db
        .prepare(
          `update org_subscriptions set status='past_due', grace_ends_at=?, updated_at=? where org_id=?`,
        )
        .run(grace.toISOString(), now, orgId);
    } else if (t.includes("customer.subscription.deleted") || t.includes("subscription.cancelled")) {
      this.db
        .prepare(
          `update org_subscriptions set status='canceled', updated_at=? where org_id=?`,
        )
        .run(now, orgId);
    } else if (t.includes("grace")) {
      this.db
        .prepare(
          `update org_subscriptions set status='grace', updated_at=? where org_id=?`,
        )
        .run(now, orgId);
    }

    return this.mapSub(
      this.db.prepare(`select * from org_subscriptions where org_id=?`).get(orgId) as SubRow,
    );
  }

  /** Entitlement gate used by feature surfaces. */
  requireFeature(orgId: string, feature: string): void {
    const sub = this.ensureTrialSubscription(orgId);
    if (sub.status === "canceled" || sub.status === "none") {
      throw new AuthError("Subscription inactive", "forbidden");
    }
    if (!featureAllowed(sub.features, feature)) {
      throw new AuthError(`Feature not entitled: ${feature}`, "forbidden");
    }
  }

  requireQuota(orgId: string, metric: string, increment = 1): void {
    const sub = this.ensureTrialSubscription(orgId);
    const q = sub.usageQuotas[metric];
    if (!q) return;
    if (quotaExceeded(q.used + increment - 1, q.limit)) {
      throw new AuthError(`Quota exceeded: ${metric}`, "forbidden");
    }
  }

  async assertEntitled(
    actor: SessionUser,
    orgId: string,
    feature: string,
  ): Promise<{ allowed: boolean; subscription: OrgSubscription }> {
    await this.gate(actor, orgId, "org:read");
    const sub = this.ensureTrialSubscription(orgId);
    const inactive = sub.status === "canceled" || sub.status === "none";
    return {
      allowed: !inactive && featureAllowed(sub.features, feature),
      subscription: sub,
    };
  }

  /** Super-admin billing controls */
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
    const sub = this.ensureTrialSubscription(orgId);
    const plan = patch.planCode ? this.getPlan(patch.planCode) : null;
    const now = nowIso();
    this.db
      .prepare(
        `update org_subscriptions set
           plan_code=coalesce(?, plan_code),
           status=coalesce(?, status),
           seats_included=coalesce(?, seats_included),
           ai_credits_included=coalesce(?, ai_credits_included),
           features=coalesce(?, features),
           interval=coalesce(?, interval),
           updated_at=?
         where org_id=?`,
      )
      .run(
        patch.planCode ?? null,
        patch.status ?? null,
        patch.seatsIncluded ?? plan?.seatsIncluded ?? null,
        patch.aiCreditsIncluded ?? plan?.aiCreditsIncluded ?? null,
        plan ? JSON.stringify(plan.features) : null,
        plan?.interval ?? null,
        now,
        orgId,
      );
    void sub;
    return this.mapSub(
      this.db.prepare(`select * from org_subscriptions where org_id=?`).get(orgId) as SubRow,
    );
  }

  listWebhookEvents(orgId?: string) {
    if (orgId) {
      return this.db
        .prepare(
          `select * from billing_webhook_events where org_id=? order by created_at desc limit 100`,
        )
        .all(orgId);
    }
    return this.db
      .prepare(`select * from billing_webhook_events order by created_at desc limit 100`)
      .all();
  }
}
