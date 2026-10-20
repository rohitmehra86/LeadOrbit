import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCrmStore } from "@/lib/tenancy/crm";
import { Badge, Button } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

export default async function LeadsSimplePage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let leads: Awaited<ReturnType<ReturnType<typeof getCrmStore>["listLeads"]>> = [];
  let error: string | null = null;
  try {
    leads = await getCrmStore().listLeads(user, orgId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leads";
  }

  return (
    <div className="lo-panel">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Leads</h1>
          <p>Newest first. Scores come from capture + qualification.</p>
        </div>
        <Link href={`/app/orgs/${orgId}/crm`}>
          <Button type="button">Open full CRM</Button>
        </Link>
      </header>

      {error ? <p className="lo-error">{error}</p> : null}

      {leads.length === 0 ? (
        <div className="lo-empty">
          <p>No leads yet. Use AI Assistant to launch a capture page, then share the link.</p>
          <Link href={`/app/orgs/${orgId}/assistant`}>
            <Button type="button">Open Assistant</Button>
          </Link>
        </div>
      ) : (
        <ul className="lo-lead-list">
          {leads.slice(0, 50).map((lead) => (
            <li key={lead.id}>
              <div>
                <strong>{lead.fullName || "Unnamed"}</strong>
                <span className="lo-muted">
                  {[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact"}
                </span>
              </div>
              <div className="lo-lead-meta">
                <Badge>score {lead.score ?? 0}</Badge>
                <Badge>{lead.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
