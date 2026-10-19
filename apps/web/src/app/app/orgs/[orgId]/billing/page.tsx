import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getBillingStore } from "@/lib/tenancy/billing";
import { Button } from "@leadorbit/ui";
import { BillingConsole } from "./billing-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function BillingPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const store = getBillingStore();
  const subscription = await store.getSubscription(user, orgId);
  const invoices = await store.listInvoices(user, orgId);
  const providers = await store.providerStatus(user, orgId);
  const plans = store.listPlans();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Subscription</p>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Trials, seats, AI credits, and invoices. Stripe/Razorpay activate only
            via verified webhooks — never from client-only success, never store
            raw cards.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/orgs/${orgId}/white-label`}>
            <Button type="button">White label</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/analytics`}>
            <Button type="button">Analytics</Button>
          </Link>
        </div>
      </div>
      <BillingConsole
        orgId={orgId}
        subscription={subscription}
        invoices={invoices}
        providers={providers}
        plans={plans}
        isPlatformAdmin={user.isPlatformAdmin}
      />
    </div>
  );
}
