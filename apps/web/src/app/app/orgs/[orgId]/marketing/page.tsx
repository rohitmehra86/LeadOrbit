import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getTenancyStore } from "@/lib/tenancy/service";
import { Button } from "@leadorbit/ui";
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
    <div className="lo-panel flex flex-col gap-6">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Marketing</h1>
          <p>
            Launch capture pages, share landing links, and track Results. Ad
            channels stay behind “Show advanced tools” — never on first paint.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/results`}>
          <Button type="button">Results</Button>
        </Link>
      </header>

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
