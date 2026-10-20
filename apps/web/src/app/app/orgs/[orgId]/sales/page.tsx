import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getDomainCrm } from "@/lib/tenancy/crm";
import { getAuthMode } from "@leadorbit/db";
import { Badge, Button } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

export default async function SalesSimplePage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const crm = getDomainCrm();
  const leads = await crm.listLeads(user, orgId);
  const tasks = "listTasks" in crm ? await crm.listTasks(user, orgId) : [];
  const openTasks = tasks.filter((t) => t.status === "open").slice(0, 8);
  const hotLeads = leads.filter((l) => (l.score ?? 0) >= 45).slice(0, 8);

  return (
    <div className="lo-panel">
      <header className="lo-panel-head lo-panel-head-row">
        <div>
          <h1>Sales & Appointments</h1>
          <p>
            Convert loop: qualify → assign → follow-up task → book meeting/site visit via AI
            Assistant. Calendar OAuth / telephony remain{" "}
            <strong>blocked until provider credentials</strong>. Mode:{" "}
            <code>{getAuthMode()}</code>
          </p>
        </div>
        <div className="lo-card-actions">
          <Link href={`/app/orgs/${orgId}/assistant`}>
            <Button type="button">Ask Assistant</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/calendar`}>
            <Button type="button">Calendar</Button>
          </Link>
        </div>
      </header>

      <section className="lo-section" style={{ marginTop: "1.25rem" }}>
        <h2>Hot leads</h2>
        {hotLeads.length === 0 ? (
          <p className="lo-muted">No medium+ scored leads yet. Qualify from the Assistant.</p>
        ) : (
          <ul className="lo-lead-list">
            {hotLeads.map((lead) => (
              <li key={lead.id}>
                <div>
                  <strong>{lead.fullName}</strong>
                  <span className="lo-muted">{lead.id}</span>
                </div>
                <div className="lo-lead-meta">
                  <Badge>score {lead.score}</Badge>
                  <Badge>{lead.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lo-section" style={{ marginTop: "1.5rem" }}>
        <h2>Open follow-ups</h2>
        {openTasks.length === 0 ? (
          <p className="lo-muted">
            No open tasks. Try: “create follow-up task for lead &lt;id&gt;”.
          </p>
        ) : (
          <ul className="lo-lead-list">
            {openTasks.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span className="lo-muted">
                    {task.entityType} {task.entityId}
                    {task.dueAt ? ` · due ${task.dueAt}` : ""}
                  </span>
                </div>
                <Badge>{task.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
