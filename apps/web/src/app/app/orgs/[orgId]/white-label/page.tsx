import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getWhiteLabelStore } from "@/lib/tenancy/white-label";
import { getBillingStore } from "@/lib/tenancy/billing";
import { Button } from "@leadorbit/ui";
import { WhiteLabelConsole } from "./white-label-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function WhiteLabelPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const entitled = await getBillingStore().assertEntitled(
    user,
    orgId,
    "white_label",
  );

  let brand = null;
  let domains: Awaited<
    ReturnType<ReturnType<typeof getWhiteLabelStore>["listDomains"]>
  > = [];
  let visibility = { features: [] as string[], all: {} as Record<string, boolean> };
  let agencyChildren: Awaited<
    ReturnType<ReturnType<typeof getWhiteLabelStore>["listAgencyChildren"]>
  > = [];
  let loadError: string | null = null;

  try {
    const store = getWhiteLabelStore();
    brand = await store.getBrand(user, orgId);
    domains = await store.listDomains(user, orgId);
    visibility = await store.featureVisibility(user, orgId);
    agencyChildren = await store.listAgencyChildren(user, orgId);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load white-label";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Agency</p>
          <h1 className="text-3xl font-semibold tracking-tight">White label</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Logo, colors, branded login/emails, custom domain verification
            scaffolding, and feature visibility by subscription.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/billing`}>
          <Button type="button">Billing</Button>
        </Link>
      </div>
      {!entitled.allowed ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          White-label is not on the current plan ({entitled.subscription.planCode}).
          Upgrade to Growth (or use platform admin) to edit branding.
        </p>
      ) : null}
      {loadError ? (
        <p className="text-sm text-red-300">{loadError}</p>
      ) : brand ? (
        <WhiteLabelConsole
          orgId={orgId}
          brand={brand}
          domains={domains}
          visibility={visibility}
          agencyChildren={agencyChildren}
          canEdit={entitled.allowed}
        />
      ) : null}
    </div>
  );
}
