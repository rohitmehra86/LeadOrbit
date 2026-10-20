import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getBillingStore } from "@/lib/tenancy/billing";
import { AuthError } from "@leadorbit/db";
import { Badge } from "@leadorbit/ui";
import { signOutAction } from "@/app/actions/auth";
import { PlatformOpsConsole } from "./platform-ops-console";

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
  let usage: Array<{
    orgId: string;
    planCode: string;
    status: string;
    aiCreditsUsed: number;
    aiCreditsIncluded: number;
    usageQuotas: Record<string, { limit: number; used: number }>;
  }> = [];
  let flags: { id: string; orgId: string | null; key: string; enabled: boolean }[] = [];
  let audit: {
    id: string;
    orgId: string | null;
    actorUserId: string | null;
    action: string;
    entityType: string;
    createdAt: string;
  }[] = [];
  let error: string | null = null;

  try {
    const store = getTenancyStore();
    orgs = (await store.listAllOrgsAsPlatformAdmin(user)).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      orgType: o.orgType,
      createdAt: o.createdAt,
    }));
    usage = await getBillingStore().platformUsageSummary(user);
    if ("listAllFlagsAsPlatformAdmin" in store) {
      flags = await store.listAllFlagsAsPlatformAdmin(user);
    }
    if ("listAllAuditAsPlatformAdmin" in store) {
      audit = await store.listAllAuditAsPlatformAdmin(user, 100);
    }
  } catch (e) {
    error = e instanceof AuthError ? e.message : "Failed to load platform data";
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platform admin</h1>
          <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
            Tenants, usage metering, feature flags, and audit — restricted to platform
            admins. Destructive controls remain deferred.
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

      {error ? <p className="mb-4 text-red-300">{error}</p> : null}

      <PlatformOpsConsole
        orgs={orgs}
        usage={usage}
        flags={flags}
        audit={audit}
      />
    </main>
  );
}
