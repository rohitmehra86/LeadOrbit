import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";

type Ctx = { params: Promise<{ orgId: string; enrollmentId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, enrollmentId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getWorkflowStore().listStepRuns(user, orgId, enrollmentId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
