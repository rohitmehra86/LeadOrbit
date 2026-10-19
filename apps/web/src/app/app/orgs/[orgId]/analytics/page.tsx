import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getAnalyticsStore } from "@/lib/tenancy/analytics";
import { getBillingStore } from "@/lib/tenancy/billing";
import { Button } from "@leadorbit/ui";
import { AnalyticsConsole } from "./analytics-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function AnalyticsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const entitled = await getBillingStore().assertEntitled(user, orgId, "analytics");
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 30 * 864e5).toISOString();
  const compareTo = new Date(Date.now() - 30 * 864e5).toISOString();
  const compareFrom = new Date(Date.now() - 60 * 864e5).toISOString();

  let dashboard = null;
  let reports: Awaited<
    ReturnType<ReturnType<typeof getAnalyticsStore>["listScheduledReports"]>
  > = [];
  let error: string | null = null;

  if (!entitled.allowed) {
    error = "Analytics not entitled on current plan";
  } else {
    try {
      const store = getAnalyticsStore();
      dashboard = await store.dashboard(user, orgId, {
        from,
        to,
        compareFrom,
        compareTo,
      });
      reports = await store.listScheduledReports(user, orgId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load analytics";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Reporting</p>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Metrics from persisted CRM, campaign, AI, and billing events. Zero
            means no rows in range; unavailable means the source table is missing.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/orgs/${orgId}/billing`}>
            <Button type="button">Billing</Button>
          </Link>
          <Link href={`/app/orgs/${orgId}`}>
            <Button type="button">Org home</Button>
          </Link>
        </div>
      </div>
      <AnalyticsConsole
        orgId={orgId}
        from={from}
        to={to}
        dashboard={dashboard}
        reports={reports}
        error={error}
      />
    </div>
  );
}
