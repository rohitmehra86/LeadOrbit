import type { CreateOrganizationRequest, OrganizationDto } from "@leadorbit/api-contracts";
import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getCrmStore } from "@/lib/tenancy/crm";


function toDto(org: {
  id: string;
  name: string;
  slug: string;
  orgType: OrganizationDto["orgType"];
  parentOrgId: string | null;
  timezone: string;
  locale: string;
  currency: string;
  branding: OrganizationDto["branding"];
}): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    orgType: org.orgType,
    parentOrgId: org.parentOrgId,
    timezone: org.timezone,
    locale: org.locale,
    currency: org.currency,
    branding: org.branding,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const store = getTenancyStore();
    const items = await store.listOrganizationsForUser(user.id);
    return jsonOk({ items: items.map(toDto) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as CreateOrganizationRequest;
    const store = getTenancyStore();
    const org = await store.createOrganization(user, {
      name: body.name,
      orgType: body.orgType,
      timezone: body.timezone,
      locale: body.locale,
      currency: body.currency,
    });
    getCrmStore().registerOrg(org.id, org.name);
    return jsonOk({ item: toDto(org) }, { status: 201 });

  } catch (err) {
    return fromAuthError(err);
  }
}
