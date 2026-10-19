import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCrmStore } from "@/lib/tenancy/crm";
import { getTenancyStore } from "@/lib/tenancy/service";
import { AuthError } from "@leadorbit/db";
import { CrmBoard } from "./crm-board";

type Props = { params: Promise<{ orgId: string }> };

export default async function CrmPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    await getTenancyStore().getOrganization(user, orgId);
  } catch (e) {
    if (e instanceof AuthError && e.code === "forbidden") {
      return <p className="text-red-300">Cross-tenant access denied.</p>;
    }
    throw e;
  }

  const crm = getCrmStore();
  crm.registerOrg(orgId, orgId);
  const pipelines = await crm.listPipelines(user, orgId);
  const leadPipe = pipelines.find((p) => p.kind === "lead") ?? pipelines[0];
  const dealPipe = pipelines.find((p) => p.kind === "deal");
  const leadStages = leadPipe
    ? await crm.listStages(user, orgId, leadPipe.id)
    : [];
  const dealStages = dealPipe
    ? await crm.listStages(user, orgId, dealPipe.id)
    : [];
  const leads = await crm.listLeads(user, orgId);
  const opportunities = await crm.listOpportunities(user, orgId);
  const contacts = await crm.listContacts(user, orgId);
  const companies = await crm.listCompanies(user, orgId);
  const tasks = await crm.listTasks(user, orgId);
  const reminders = await crm.listReminders(user, orgId);
  const rules = await crm.listAssignmentRules(user, orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">
            <Link href={`/app/orgs/${orgId}`} className="underline">
              Organization
            </Link>{" "}
            / CRM
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">CRM</h1>
          <p className="mt-1 text-sm text-[var(--lo-fg-muted)]">
            Leads, deals, contacts — Kanban + table. Persisted in local SQLite.
          </p>
        </div>
      </div>
      <CrmBoard
        orgId={orgId}
        leadStages={leadStages}
        dealStages={dealStages}
        leads={leads}
        opportunities={opportunities}
        contacts={contacts}
        companies={companies}
        tasks={tasks}
        reminders={reminders}
        rules={rules}
      />
    </div>
  );
}
