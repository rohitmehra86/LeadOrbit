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
    <div className="flex flex-col gap-8">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Marketing</h1>
          <p>
            Campaigns, forms, and landing pages. Ad networks stay pending until
            credentials are configured — never faked as live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/orgs/${orgId}/marketing/forms`}>
            <Button type="button" variant="secondary">
              Form builder
            </Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/marketing/pages`}>
            <Button type="button" variant="secondary">
              Page builder
            </Button>
          </Link>
        </div>
      </header>

      <div className="lo-stat-grid">
        <div className="lo-stat">
          <span className="lo-stat-value">{campaigns.length}</span>
          <span className="lo-stat-label">Campaigns</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{forms.length}</span>
          <span className="lo-stat-label">Forms</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{pages.length}</span>
          <span className="lo-stat-label">Pages</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{funnels.length}</span>
          <span className="lo-stat-label">Funnels</span>
        </div>
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
