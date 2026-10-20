import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getDomainCrm } from "@/lib/tenancy/crm";
import { getTenancyStore } from "@/lib/tenancy/service";
import { LeadsInbox } from "./leads-inbox";

type Props = {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ status?: string; owner?: string }>;
};

export default async function LeadsSimplePage({ params, searchParams }: Props) {
  const { orgId } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await getTenancyStore().getOrganization(user, orgId);

  let leads: Awaited<ReturnType<ReturnType<typeof getDomainCrm>["listLeads"]>> =
    [];
  let error: string | null = null;
  try {
    leads = await getDomainCrm().listLeads(user, orgId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leads";
  }

  const members = await getTenancyStore().listMembers(user, orgId);

  if (error) {
    return (
      <div className="lo-panel">
        <header className="lo-panel-head">
          <h1>Leads</h1>
          <p>Could not load the CRM inbox.</p>
        </header>
        <p className="lo-error">{error}</p>
      </div>
    );
  }

  return (
    <LeadsInbox
      orgId={orgId}
      leads={leads}
      currentUserId={user.id}
      members={members.map((m) => ({ userId: m.userId, role: m.role }))}
      initialStatus={sp.status}
      initialOwner={sp.owner}
    />
  );
}
