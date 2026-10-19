import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string; oppId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, oppId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as { stageId?: string };
    if (!body.stageId) {
      const item = await getCrmStore().getOpportunity(user, orgId, oppId);
      return jsonOk({ item });
    }
    const item = await getCrmStore().moveOpportunityStage(
      user,
      orgId,
      oppId,
      body.stageId,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
