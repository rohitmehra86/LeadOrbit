import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { AuthError } from "@leadorbit/db";
import { InviteForm } from "./invite-form";
import { SettingsForm } from "./settings-form";
import { Badge } from "@leadorbit/ui";

type Props = { params: Promise<{ orgId: string }> };

export default async function OrgDetailPage({ params }: Props) {
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
        <p className="text-red-300">
          Cross-tenant access denied. You are not a member of this organization.
        </p>
      );
    }
    if (e instanceof AuthError && e.code === "not_found") notFound();
    throw e;
  }

  const membership = await store.getMembership(user.id, orgId);
  const members = await store.listMembers(user, orgId);
  const flags = await store.listFlags(user, orgId);
  const billing = {
    entitlement: await store.getEntitlements(user, orgId),
    quotas: await store.listQuotas(user, orgId),
  };
  let audit: Awaited<ReturnType<typeof store.listAudit>> = [];
  try {
    audit = await store.listAudit(user, orgId);
  } catch {
    audit = [];
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{org.name}</h1>
          <Badge>{org.orgType}</Badge>
          {membership ? <Badge>{membership.role}</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
          {org.slug} · {org.timezone} · {org.locale} · {org.currency}
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-medium">Settings & branding</h2>
          <SettingsForm org={org} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-medium">Invite teammate</h2>
          <InviteForm orgId={org.id} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Members</h2>
        <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)] text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex justify-between px-4 py-2">
              <span className="font-mono text-xs">{m.userId}</span>
              <span>
                {m.role} · {m.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-medium">Feature flags</h2>
          <ul className="space-y-2 text-sm">
            {flags.map((f) => (
              <li
                key={f.id}
                className="flex justify-between rounded-md border border-[var(--lo-border)] px-3 py-2"
              >
                <span>{f.key}</span>
                <span>{f.enabled ? "on" : "off"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-medium">Entitlements & quotas</h2>
          <pre className="overflow-auto rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface)] p-3 text-xs">
            {JSON.stringify(billing, null, 2)}
          </pre>
          <p className="mt-2 text-xs text-[var(--lo-fg-muted)]">
            Payment provider wiring is Milestone 8 — stubs only.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Audit trail</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-[var(--lo-fg-muted)]">
            No readable audit events (requires manager+).
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audit
              .slice()
              .reverse()
              .map((a) => (
                <li
                  key={a.id}
                  className="rounded-md border border-[var(--lo-border)] px-3 py-2"
                >
                  <span className="font-medium">{a.action}</span>{" "}
                  <span className="text-[var(--lo-fg-muted)]">
                    {a.entityType} · {a.createdAt}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
