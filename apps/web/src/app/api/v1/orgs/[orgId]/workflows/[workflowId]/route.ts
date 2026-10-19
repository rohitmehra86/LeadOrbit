import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";
import type { WorkflowGraph, WorkflowStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; workflowId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, workflowId } = await ctx.params;
    const user = await requireUser();
    const item = await getWorkflowStore().getWorkflow(user, orgId, workflowId);
    if (!item) return jsonProblem(404, "Not Found", "Workflow not found");
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, workflowId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as Partial<{
      name: string;
      graph: WorkflowGraph;
      testMode: boolean;
      status: WorkflowStatus;
    }>;
    const item = await getWorkflowStore().updateWorkflow(
      user,
      orgId,
      workflowId,
      body,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
