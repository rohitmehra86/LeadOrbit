import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getTenancyStore } from "@/lib/tenancy/service";
import { Button } from "@leadorbit/ui";
import { FormBuilder } from "./form-builder";

type Props = { params: Promise<{ orgId: string }> };

export default async function FormsPage({ params }: Props) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getTenancyStore().getOrganization(user, orgId);
  const store = getCampaignStore();
  const [forms, campaigns] = await Promise.all([
    store.listForms(user, orgId),
    store.listCampaigns(user, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--lo-fg-muted)]">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight">Form builder</h1>
          <p className="mt-2 text-sm text-[var(--lo-fg-muted)]">
            Drag fields to reorder. Conditional steps, CRM mapping, honeypot, and
            duplicate detection persist per tenant.
          </p>
        </div>
        <Link href={`/app/orgs/${orgId}/marketing`}>
          <Button type="button">Back to campaigns</Button>
        </Link>
      </div>
      <FormBuilder orgId={orgId} forms={forms} campaigns={campaigns} />
    </div>
  );
}
