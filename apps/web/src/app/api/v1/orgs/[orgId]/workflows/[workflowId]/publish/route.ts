import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";

type Ctx = { params: Promise<{ orgId: string; workflowId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId, workflowId } = await ctx.params;
    const user = await requireUser();
    const item = await getWorkflowStore().publishWorkflow(
      user,
      orgId,
      workflowId,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
