import type { OrganizationDto, UpdateOrgSettingsRequest } from "@leadorbit/api-contracts";
import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

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

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const org = await getTenancyStore().getOrganization(user, orgId);
    return jsonOk({ item: toDto(org) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as UpdateOrgSettingsRequest;
    const org = await getTenancyStore().updateOrganizationSettings(user, orgId, body);
    return jsonOk({ item: toDto(org) });
  } catch (err) {
    return fromAuthError(err);
  }
}
