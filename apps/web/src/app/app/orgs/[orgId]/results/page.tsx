import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getDomainCrm } from "@/lib/tenancy/crm";
import { getDomainCampaigns } from "@/lib/tenancy/campaigns";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import {
  deriveAdSpendSnapshot,
  formatAdSpendForResults,
} from "@leadorbit/domain";
import { Button } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

export default async function ResultsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const leads = await getDomainCrm().listLeads(user, orgId);
  const campaigns = await getDomainCampaigns().listCampaigns(user, orgId);
  const pages = await getDomainCampaigns().listPages(user, orgId);
  const publishedPages = pages.filter((p) => p.status === "published");
  const mediumPlus = leads.filter((l) => (l.score ?? 0) >= 45).length;

  let events: Array<{ eventType: string; meta?: Record<string, unknown> | null }> =
    [];
  try {
    const store = getCampaignStore() as {
      listMarketingEvents?: (
        a: typeof user,
        o: string,
      ) => Promise<Array<{ eventType: string; meta?: Record<string, unknown> }>>;
    };
    if (typeof store.listMarketingEvents === "function") {
      events = await store.listMarketingEvents(user, orgId);
    }
  } catch {
    events = [];
  }

  const metaSpend = deriveAdSpendSnapshot({ network: "meta", events });
  const googleSpend = deriveAdSpendSnapshot({ network: "google_ads", events });
  const metaFmt = formatAdSpendForResults(metaSpend);
  const googleFmt = formatAdSpendForResults(googleSpend);

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
        <div className="lo-stat">
          <span
            className="lo-stat-value"
            data-tone={metaFmt.tone}
            title={metaSpend.detail}
          >
            {metaFmt.value}
          </span>
          <span className="lo-stat-label">{metaFmt.label}</span>
        </div>
        <div className="lo-stat">
          <span
            className="lo-stat-value"
            data-tone={googleFmt.tone}
            title={googleSpend.detail}
          >
            {googleFmt.value}
          </span>
          <span className="lo-stat-label">{googleFmt.label}</span>
        </div>
      </div>

      <p className="lo-muted" style={{ marginTop: "0.5rem" }}>
        Ad spend shows <strong>Unavailable</strong> when Insights pull is not configured —
        never invents zero. Zero only appears when spend events exist totaling 0.
      </p>

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
                <code>
                  /p/{orgId}/{p.slug}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
