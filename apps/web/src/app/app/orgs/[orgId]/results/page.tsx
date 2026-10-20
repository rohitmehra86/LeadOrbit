import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCrmStore } from "@/lib/tenancy/crm";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { Button } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

export default async function ResultsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const leads = await getCrmStore().listLeads(user, orgId);
  const campaigns = await getCampaignStore().listCampaigns(user, orgId);
  const pages = await getCampaignStore().listPages(user, orgId);
  const publishedPages = pages.filter((p) => p.status === "published");
  const mediumPlus = leads.filter((l) => (l.score ?? 0) >= 45).length;

  return (
    <div className="lo-panel">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Results</h1>
          <p>Signals from persisted campaigns and leads — not vanity dashboards.</p>
        </div>
        <Link href={`/app/orgs/${orgId}/analytics`}>
          <Button type="button">Full analytics</Button>
        </Link>
      </header>

      <div className="lo-stat-grid">
        <div className="lo-stat">
          <span className="lo-stat-value">{leads.length}</span>
          <span className="lo-stat-label">Leads</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{mediumPlus}</span>
          <span className="lo-stat-label">Medium+ score</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{campaigns.length}</span>
          <span className="lo-stat-label">Campaigns</span>
        </div>
        <div className="lo-stat">
          <span className="lo-stat-value">{publishedPages.length}</span>
          <span className="lo-stat-label">Live pages</span>
        </div>
      </div>

      <section className="lo-section">
        <h2>Live capture links</h2>
        {publishedPages.length === 0 ? (
          <p className="lo-muted">
            None yet. Ask the Assistant to “launch a campaign…” and approve publish.
          </p>
        ) : (
          <ul className="lo-link-list">
            {publishedPages.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${orgId}/${p.slug}`}>{p.name}</Link>
                <code>/p/{orgId}/{p.slug}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
