import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getMarketplaceStore } from "@/lib/tenancy/marketplace";
import { Button } from "@leadorbit/ui";
import { MarketplaceConsole } from "./marketplace-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function MarketplacePage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);

  const store = getMarketplaceStore();
  const catalog = store.listCatalog(true);
  const installs = await store.listInstalls(user, orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Marketplace</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Launch Pack templates
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lo-fg-muted)]">
            Install reusable industry packs into this workspace. Install creates a
            real draft Launch Pack — publish is optional and never fakes live ads.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/orgs/${orgId}/developers`}>
            <Button type="button" variant="secondary">
              Developers
            </Button>
          </Link>
          <Link href={`/app/orgs/${orgId}/assistant`}>
            <Button type="button">AI Assistant</Button>
          </Link>
        </div>
      </div>
      <MarketplaceConsole
        orgId={orgId}
        catalog={catalog}
        installs={installs}
      />
    </div>
  );
}
