import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getIngestionStore } from "@/lib/tenancy/ingestion";
import { Button } from "@leadorbit/ui";
import { IntegrationsConsole } from "./integrations-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function IntegrationsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const store = getIngestionStore();
  const [endpoints, channels, events, deliveries] = await Promise.all([
    store.listWebhookEndpoints(user, orgId),
    store.listChannelAdapters(user, orgId),
    store.listIngestionEvents(user, orgId),
    store.listDeliveries(user, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Integrations</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Lead ingestion & attribution
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Signed webhooks, channel adapters, idempotent ingest, and UTM →
            campaign → lead attribution. Meta/Google lead ads stay
            pending_configuration without credentials — never faked as live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/orgs/${orgId}/marketing`}>
            <Button type="button">Marketing</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/crm`}>
            <Button type="button">CRM</Button>
          </Link>
        </div>
      </div>
      <IntegrationsConsole
        orgId={orgId}
        endpoints={endpoints}
        channels={channels}
        events={events}
        deliveries={deliveries}
      />
    </div>
  );
}
