"use client";

import { useState } from "react";
import type {
  BillingPlan,
  Invoice,
  OrgSubscription,
  PaymentProviderStatus,
} from "@leadorbit/domain";
import { Badge, Button } from "@leadorbit/ui";

type Props = {
  orgId: string;
  subscription: OrgSubscription;
  invoices: Invoice[];
  providers: Record<
    string,
    { status: PaymentProviderStatus; detail: string }
  >;
  plans: BillingPlan[];
  isPlatformAdmin: boolean;
};

export function BillingConsole(props: Props) {
  const [sub, setSub] = useState(props.subscription);
  const [invoices, setInvoices] = useState(props.invoices);
  const [message, setMessage] = useState<string | null>(null);

  async function checkout(planCode: string, provider: "stripe" | "razorpay") {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/billing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "checkout", planCode, provider }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Checkout failed");
      return;
    }
    setMessage(`${data.status}: ${data.detail}`);
    if (data.invoice) setInvoices((prev) => [data.invoice, ...prev]);
    // Never treat client redirect as activation — webhook only.
    if (data.checkoutUrl && typeof data.checkoutUrl === "string") {
      window.location.assign(data.checkoutUrl);
    }
  }

  async function changePlan(planCode: string, mode: "upgrade" | "downgrade") {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/billing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "change_plan", planCode, mode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Plan change failed");
      return;
    }
    setSub(data.subscription);
    setMessage(`Plan set to ${data.subscription.planCode} (${mode})`);
  }

  async function cancel() {
    setMessage(null);
    const res = await fetch(`/api/v1/orgs/${props.orgId}/billing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", atPeriodEnd: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Cancel failed");
      return;
    }
    setSub(data.subscription);
    setMessage("Cancellation scheduled at period end");
  }

  async function platformActivateGrowth() {
    setMessage(null);
    const res = await fetch(`/api/v1/platform/billing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId: props.orgId,
        planCode: "growth_monthly",
        status: "active",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.detail ?? "Platform update failed");
      return;
    }
    setSub(data.subscription);
    setMessage("Platform admin set Growth plan active");
  }

  return (
    <div className="flex flex-col gap-8">
      {message ? (
        <p className="rounded-md border border-[var(--lo-border)] px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-[var(--lo-border)] p-4">
          <h2 className="mb-2 text-lg font-medium">Current subscription</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Plan</dt>
              <dd className="font-mono">{sub.planCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Status</dt>
              <dd>
                <Badge>{sub.status}</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Interval</dt>
              <dd>{sub.interval}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Seats</dt>
              <dd>
                {sub.seatsUsed} / {sub.seatsIncluded}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>AI credits</dt>
              <dd>
                {sub.aiCreditsUsed} / {sub.aiCreditsIncluded}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Provider</dt>
              <dd>{sub.provider}</dd>
            </div>
            {sub.graceEndsAt ? (
              <div className="flex justify-between">
                <dt>Grace ends</dt>
                <dd>{sub.graceEndsAt.slice(0, 10)}</dd>
              </div>
            ) : null}
            {sub.cancelAtPeriodEnd ? (
              <p className="pt-2 text-amber-400">Cancels at period end</p>
            ) : null}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void cancel()}>
              Cancel at period end
            </Button>
            {props.isPlatformAdmin ? (
              <Button type="button" onClick={() => void platformActivateGrowth()}>
                Platform: activate Growth
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-[var(--lo-border)] p-4">
          <h2 className="mb-2 text-lg font-medium">Payment providers</h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(props.providers).map(([name, p]) => (
              <li key={name} className="flex justify-between gap-2">
                <span className="capitalize">{name}</span>
                <span className="text-right text-[var(--lo-fg-muted)]">
                  <Badge>{p.status}</Badge>
                  <span className="mt-1 block text-xs">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--lo-fg-muted)]">
            Cards are never stored. Webhooks:{" "}
            <code>/api/v1/billing/webhooks/stripe</code> ·{" "}
            <code>/api/v1/billing/webhooks/razorpay</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Plans</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {props.plans.map((plan) => (
            <li
              key={plan.id}
              className="rounded-md border border-[var(--lo-border)] p-4 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{plan.name}</span>
                <Badge>{plan.interval}</Badge>
              </div>
              <p className="mt-1 font-mono">
                {(plan.priceCents / 100).toFixed(2)} {plan.currency}
              </p>
              <p className="mt-1 text-[var(--lo-fg-muted)]">
                {plan.seatsIncluded} seats · {plan.aiCreditsIncluded} AI credits
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void checkout(plan.code, "stripe")}
                >
                  Checkout Stripe
                </Button>
                <Button
                  type="button"
                  onClick={() => void checkout(plan.code, "razorpay")}
                >
                  Checkout Razorpay
                </Button>
                <Button
                  type="button"
                  onClick={() => void changePlan(plan.code, "upgrade")}
                >
                  Set plan
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Entitled features</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {Object.entries(sub.features).map(([k, v]) => (
            <li key={k}>
              <Badge>
                {k}: {v ? "on" : "off"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)] text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-mono text-xs">{inv.number}</span>
                <span>
                  {(inv.amountCents / 100).toFixed(2)} {inv.currency}
                </span>
                <Badge>{inv.status}</Badge>
                <span className="text-[var(--lo-fg-muted)]">{inv.provider}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
