import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getRealEstateStore } from "@/lib/tenancy/real-estate";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getRealEstateStore();
    return jsonOk({
      enabled: await store.isModuleEnabled(user, orgId),
      templates: await store.listIndustryTemplates(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      enabled?: boolean;
      templateId?: "real_estate" | "education" | "automotive" | "service_business";
    };
    const store = getRealEstateStore();
    if (body.templateId) {
      await store.selectIndustryTemplate(user, orgId, body.templateId);
    }
    if (body.enabled != null) {
      await store.setModuleEnabled(user, orgId, body.enabled);
    }
    return jsonOk({
      enabled: await store.isModuleEnabled(user, orgId),
      templates: await store.listIndustryTemplates(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
