import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getTenancyStore } from "@/lib/tenancy/service";
import { Button } from "@leadorbit/ui";
import { PageBuilder } from "./page-builder";

type Props = { params: Promise<{ orgId: string }> };

export default async function PagesPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);
  const store = getCampaignStore();
  const [pages, forms, campaigns] = await Promise.all([
    store.listPages(user, orgId),
    store.listForms(user, orgId),
    store.listCampaigns(user, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight">Page builder</h1>
          <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
            Structured blocks only — no arbitrary script execution. Includes
            real-estate template, SEO metadata, draft/publish, and mobile preview.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/marketing`}>
          <Button type="button">Back to campaigns</Button>
        </Link>
      </div>
      <PageBuilder
        orgId={orgId}
        pages={pages}
        forms={forms}
        campaigns={campaigns}
      />
    </div>
  );
}
