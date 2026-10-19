import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const crm = getCrmStore();
    crm.registerOrg(orgId, orgId);
    const pipelines = await crm.listPipelines(user, orgId);
    const withStages = await Promise.all(
      pipelines.map(async (p) => ({
        ...p,
        stages: await crm.listStages(user, orgId, p.id),
      })),
    );
    return jsonOk({ items: withStages });
  } catch (err) {
    return fromAuthError(err);
  }
}
