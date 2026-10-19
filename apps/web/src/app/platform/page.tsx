import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { AuthError } from "@leadorbit/db";
import { Badge } from "@leadorbit/ui";
import { signOutAction } from "@/app/actions/auth";

export default async function PlatformAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Platform admin</h1>
        <p className="mt-4 text-red-300">
          Restricted. Your account is not a platform admin. Access attempts should be
          audited in production when Supabase audit + platform_admins RLS are live.
        </p>
        <Link href="/app" className="mt-6 inline-block text-[var(--lo-accent)] underline">
          Back to app
        </Link>
      </main>
    );
  }

  let orgs: { id: string; name: string; slug: string; orgType: string; createdAt: string }[] =
    [];
  let error: string | null = null;
  try {
    orgs = await getTenancyStore().listAllOrgsAsPlatformAdmin(user);
  } catch (e) {
    error =
      e instanceof AuthError ? e.message : "Failed to load tenants";
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platform admin</h1>
          <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
            SaaS operator skeleton — list tenants. Destructive controls deferred until
            Supabase production wiring.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Badge>super-admin</Badge>
          <Link href="/app" className="underline">
            App
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {error ? <p className="text-red-300">{error}</p> : null}

      <ul className="divide-y divide-[var(--lo-border)] rounded-md border border-[var(--lo-border)]">
        {orgs.map((o) => (
          <li key={o.id} className="flex justify-between px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{o.name}</span>{" "}
              <span className="text-[var(--lo-fg-muted)]">{o.slug}</span>
            </span>
            <span className="text-[var(--lo-fg-muted)]">
              {o.orgType} · {o.createdAt}
            </span>
          </li>
        ))}
        {orgs.length === 0 ? (
          <li className="px-4 py-6 text-sm text-[var(--lo-fg-muted)]">
            No tenants yet.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
