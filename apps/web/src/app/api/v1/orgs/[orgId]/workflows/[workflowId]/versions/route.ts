import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";

type Ctx = { params: Promise<{ orgId: string; workflowId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, workflowId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getWorkflowStore().listVersions(user, orgId, workflowId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
