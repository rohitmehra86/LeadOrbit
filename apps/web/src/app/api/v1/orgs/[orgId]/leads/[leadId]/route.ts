import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string; leadId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, leadId } = await ctx.params;
    const user = await requireUser();
    const item = await getCrmStore().getLead(user, orgId, leadId);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, leadId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      stageId?: string;
      ownerUserId?: string | null;
      assignStrategy?: import("@leadorbit/domain").AssignmentStrategy;
    };
    const crm = getCrmStore();
    let item;
    if (body.stageId) {
      item = await crm.updateLeadStage(user, orgId, leadId, body.stageId);
    } else if (body.assignStrategy) {
      item = await crm.autoAssignLead(user, orgId, leadId, body.assignStrategy);
    } else if ("ownerUserId" in body) {
      item = await crm.assignLead(user, orgId, leadId, body.ownerUserId ?? null);
    } else {
      item = await crm.getLead(user, orgId, leadId);
    }
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
