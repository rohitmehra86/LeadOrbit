import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";
import type { WorkflowGraph } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getWorkflowStore().listWorkflows(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      graph?: WorkflowGraph;
      template?: "lead_created" | null;
      testMode?: boolean;
    };
    const item = await getWorkflowStore().createWorkflow(user, orgId, {
      name: body.name ?? "Untitled workflow",
      graph: body.graph,
      template: body.template,
      testMode: body.testMode,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
