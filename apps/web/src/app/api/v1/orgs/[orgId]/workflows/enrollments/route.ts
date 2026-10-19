import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const workflowId =
      new URL(request.url).searchParams.get("workflowId") ?? undefined;
    return jsonOk({
      items: await getWorkflowStore().listEnrollments(user, orgId, workflowId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
