import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getTenancyStore } from "@/lib/tenancy/service";
import { Badge, Button } from "@leadorbit/ui";
import { MarketingConsole } from "./marketing-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function MarketingPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await getTenancyStore().getOrganization(user, orgId);
  const store = getCampaignStore();
  const [campaigns, forms, pages, funnels, creatives, integrations] =
    await Promise.all([
      store.listCampaigns(user, orgId),
      store.listForms(user, orgId),
      store.listPages(user, orgId),
      store.listFunnels(user, orgId),
      store.listCreatives(user, orgId),
      store.listAdIntegrations(user, orgId),
    ]);

  const performance = await Promise.all(
    campaigns.map(async (c) => store.campaignPerformance(user, orgId, c.id)),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Campaigns & funnels
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--lo-fg-muted)]">
            Create campaigns, forms, and landing pages. Ad networks stay
            pending until credentials are configured — never faked as live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/orgs/${orgId}/marketing/forms`}>
            <Button type="button">Form builder</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/marketing/pages`}>
            <Button type="button">Page builder</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/crm`}>
            <Button type="button">CRM</Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge>{campaigns.length} campaigns</Badge>
        <Badge>{forms.length} forms</Badge>
        <Badge>{pages.length} pages</Badge>
        <Badge>{funnels.length} funnels</Badge>
      </div>

      <MarketingConsole
        orgId={orgId}
        campaigns={campaigns}
        forms={forms}
        pages={pages}
        funnels={funnels}
        creatives={creatives}
        integrations={integrations}
        performance={performance}
      />
    </div>
  );
}
