import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getDomainCrm } from "@/lib/tenancy/crm";
import { getDomainCampaigns } from "@/lib/tenancy/campaigns";
import { AuthError } from "@leadorbit/db";
import Link from "next/link";
import { Badge, Button } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

type Kpi = {
  label: string;
  value: string;
  tone?: "unavailable";
  hint?: string;
};

export default async function OrgDashboardPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const store = getTenancyStore();
  let org;
  try {
    org = await store.getOrganization(user, orgId);
  } catch (e) {
    if (e instanceof AuthError && e.code === "forbidden") {
      return (
        <p className="text-[var(--lo-danger)]">
          Cross-tenant access denied. You are not a member of this organization.
        </p>
      );
    }
    if (e instanceof AuthError && e.code === "not_found") notFound();
    throw e;
  }

  const membership = await store.getMembership(user.id, orgId);
  const members = await store.listMembers(user, orgId);

  let leadsOk = true;
  let leads: Awaited<ReturnType<ReturnType<typeof getDomainCrm>["listLeads"]>> =
    [];
  try {
    leads = await getDomainCrm().listLeads(user, orgId);
  } catch {
    leadsOk = false;
  }

  let campaignsOk = true;
  let campaigns: Awaited<
    ReturnType<ReturnType<typeof getDomainCampaigns>["listCampaigns"]>
  > = [];
  let pages: Awaited<
    ReturnType<ReturnType<typeof getDomainCampaigns>["listPages"]>
  > = [];
  try {
    const c = getDomainCampaigns();
    campaigns = await c.listCampaigns(user, orgId);
    pages = await c.listPages(user, orgId);
  } catch {
    campaignsOk = false;
  }

  let audit: Awaited<ReturnType<typeof store.listAudit>> = [];
  let auditOk = true;
  try {
    audit = await store.listAudit(user, orgId);
  } catch {
    auditOk = false;
  }

  const newLeads = leads.filter((l) => l.status === "new").length;
  const needsOwner = leads.filter((l) => !l.ownerUserId).length;
  const mediumPlus = leads.filter((l) => (l.score ?? 0) >= 45).length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const livePages = pages.filter((p) => p.status === "published").length;

  const kpis: Kpi[] = [
    leadsOk
      ? { label: "Leads", value: String(leads.length) }
      : {
          label: "Leads",
          value: "Unavailable",
          tone: "unavailable",
          hint: "CRM store error",
        },
    leadsOk
      ? { label: "New / unworked", value: String(newLeads) }
      : { label: "New / unworked", value: "—", tone: "unavailable" },
    leadsOk
      ? { label: "Medium+ score", value: String(mediumPlus) }
      : { label: "Medium+ score", value: "—", tone: "unavailable" },
    campaignsOk
      ? { label: "Active campaigns", value: String(activeCampaigns) }
      : {
          label: "Active campaigns",
          value: "Unavailable",
          tone: "unavailable",
          hint: "Campaign store error",
        },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{org.name}</h1>
            <Badge>{org.orgType}</Badge>
            {membership ? <Badge>{membership.role}</Badge> : null}
          </div>
          <p>
            {org.slug} · {org.timezone} · {org.locale} · {org.currency}
          </p>
        </div>
        <div className="lo-card-actions" style={{ marginTop: 0 }}>
          <Link href={`/app/orgs/${orgId}/assistant`}>
            <Button type="button">AI Assistant</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/leads`}>
            <Button type="button" variant="secondary">
              Leads
            </Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/results`}>
            <Button type="button" variant="secondary">
              Results
            </Button>
          </Link>
        </div>
      </header>

      <section>
        <div className="lo-stat-grid">
          {kpis.map((k) => (
            <div key={k.label} className="lo-stat" title={k.hint}>
              <span className="lo-stat-value" data-tone={k.tone}>
                {k.value}
              </span>
              <span className="lo-stat-label">{k.label}</span>
            </div>
          ))}
        </div>
        <p className="lo-muted text-xs">
          Zero means no records. “Unavailable” means the store could not be
          read — not the same as empty.
          {campaignsOk
            ? ` · ${livePages} published page${livePages === 1 ? "" : "s"} · ${needsOwner} lead${needsOwner === 1 ? "" : "s"} without owner`
            : null}
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="lo-section">
          <h2>Next actions</h2>
          <ul className="lo-link-list mt-3 text-sm">
            {leadsOk && newLeads > 0 ? (
              <li>
                <Link
                  href={`/app/orgs/${orgId}/leads?status=new`}
                  className="text-[var(--lo-accent-soft)] underline"
                >
                  Review {newLeads} new lead{newLeads === 1 ? "" : "s"}
                </Link>
              </li>
            ) : null}
            {leadsOk && needsOwner > 0 ? (
              <li>
                <Link
                  href={`/app/orgs/${orgId}/leads?owner=unassigned`}
                  className="text-[var(--lo-accent-soft)] underline"
                >
                  Assign ownership ({needsOwner})
                </Link>
              </li>
            ) : null}
            {campaignsOk && campaigns.length === 0 ? (
              <li>
                <Link
                  href={`/app/orgs/${orgId}/marketing`}
                  className="text-[var(--lo-accent-soft)] underline"
                >
                  Create first campaign
                </Link>
              </li>
            ) : null}
            <li>
              <Link
                href={`/app/orgs/${orgId}/assistant`}
                className="text-[var(--lo-accent-soft)] underline"
              >
                Launch capture via AI Assistant
              </Link>
            </li>
            <li>
              <Link
                href={`/app/orgs/${orgId}/settings`}
                className="text-[var(--lo-accent-soft)] underline"
              >
                Brand, team & integrations
              </Link>
            </li>
          </ul>
        </div>
        <div className="lo-section">
          <h2>Team</h2>
          <p className="lo-muted mb-3 text-sm">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-[var(--lo-border)] rounded-[var(--radius-lg)] border border-[var(--lo-border)] text-sm">
            {members.slice(0, 6).map((m) => (
              <li key={m.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate font-mono text-xs">{m.userId}</span>
                <span className="shrink-0 text-[var(--lo-fg-muted)]">
                  {m.role} · {m.status}
                </span>
              </li>
            ))}
          </ul>
          <div className="lo-card-actions">
            <Link href={`/app/orgs/${orgId}/settings`}>
              <Button type="button" variant="secondary">
                Manage settings
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="lo-section">
        <h2>Recent activity</h2>
        {!auditOk ? (
          <p className="lo-muted mt-2">
            Audit trail unavailable (insufficient role or store error).
          </p>
        ) : audit.length === 0 ? (
          <div className="lo-empty mt-3">
            <p className="lo-muted">
              No audit events yet. Creates, invites, and settings changes appear
              here when recorded.
            </p>
          </div>
        ) : (
          <div className="lo-table-wrap mt-3">
            <table className="lo-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {audit
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((a) => (
                    <tr key={a.id}>
                      <td className="font-medium">{a.action}</td>
                      <td className="lo-muted">{a.entityType}</td>
                      <td className="lo-muted whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
