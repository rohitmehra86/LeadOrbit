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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Your workspaces</h1>
        <p className="mt-2 text-[var(--lo-fg-muted)]">
          Create a workspace, then use the AI Assistant to launch capture and see Results.
        </p>
        {user.isPlatformAdmin ? (
          <p className="mt-2">
            <Badge>Platform admin</Badge>
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Organizations</h2>
        {orgs.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            No organizations yet. Create one to start.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/app/orgs/${org.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--lo-surface-elevated)]"
                >
                  <span>
                    <span className="font-medium">{org.name}</span>
                    <span className="ml-2 text-sm text-[var(--lo-fg-muted)]">
                      {org.slug}
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-wide text-[var(--lo-fg-muted)]">
                    {org.orgType}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Create organization</h2>
        <CreateOrgForm />
      </section>
    </div>
  );
}
