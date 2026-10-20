import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getPartnerWebhookStore } from "@/lib/tenancy/partner-webhooks";
import { PARTNER_EVENT_CATALOG } from "@leadorbit/domain";
import { Button } from "@leadorbit/ui";
import { PartnerWebhooksConsole } from "./partner-webhooks-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function DevelopersPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const store = getPartnerWebhookStore();
  const [subscriptions, deliveries, inbound] = await Promise.all([
    store.listSubscriptions(user, orgId),
    store.listDeliveries(user, orgId),
    store.listInboundEvents(user, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Developers</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Partner webhooks
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Zapier/n8n-style outbound subscriptions with HMAC signatures, retries,
            and idempotent inbound partner events. Delivered only after remote HTTP
            2xx — never faked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/orgs/${orgId}/marketplace`}>
            <Button type="button">Marketplace</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/integrations`}>
            <Button type="button" variant="secondary">
              Ingestion
            </Button>
          </Link>
          <Link href="/docs/partners" className="hidden">
            Docs
          </Link>
        </div>
      </div>

      <PartnerWebhooksConsole
        orgId={orgId}
        catalog={[...PARTNER_EVENT_CATALOG]}
        subscriptions={subscriptions}
        deliveries={deliveries}
        inbound={inbound}
        inboundPath={`/api/v1/public/partners/${orgId}/webhooks`}
      />
    </div>
  );
}
