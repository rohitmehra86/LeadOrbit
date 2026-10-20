import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { CreateOrgForm } from "./create-org-form";
import { Badge } from "@leadorbit/ui";

export default async function AppHomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let orgs: Awaited<ReturnType<ReturnType<typeof getTenancyStore>["listOrganizationsForUser"]>> =
    [];
  let error: string | null = null;
  try {
    orgs = await getTenancyStore().listOrganizationsForUser(user.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load organizations";
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="lo-panel-head">
        <h1>Workspaces</h1>
        <p>
          Select an organization or create one. Each workspace isolates leads,
          campaigns, and team membership.
        </p>
        {user.isPlatformAdmin ? (
          <p className="mt-3">
            <Badge>Platform admin</Badge>
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--lo-danger)]/40 bg-[var(--lo-danger)]/10 px-4 py-3 text-sm text-[var(--lo-danger)]">
          {error}
        </p>
      ) : null}

      <section className="lo-section">
        <h2>Organizations</h2>
        {orgs.length === 0 ? (
          <div className="lo-empty mt-3">
            <p className="lo-muted">
              No organizations yet. Create a workspace to open the AI Assistant
              and Launch Pack flow.
            </p>
          </div>
        ) : (
          <div className="lo-table-wrap mt-3">
            <table className="lo-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id}>
                    <td className="font-medium">{org.name}</td>
                    <td className="lo-muted">{org.slug}</td>
                    <td className="uppercase tracking-wide text-xs text-[var(--lo-fg-muted)]">
                      {org.orgType}
                    </td>
                    <td>
                      <Link
                        href={`/app/orgs/${org.id}/assistant`}
                        className="text-[var(--lo-accent-soft)] underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lo-section">
        <h2>Create organization</h2>
        <p className="mb-3 text-sm text-[var(--lo-fg-muted)]">
          Name the workspace, then you land in the AI Assistant to launch capture.
        </p>
        <CreateOrgForm />
      </section>
    </div>
  );
}
