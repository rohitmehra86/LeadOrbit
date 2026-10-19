import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";

type Ctx = { params: Promise<{ orgId: string; workflowId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, workflowId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      leadId?: string | null;
      conversationId?: string | null;
      context?: Record<string, unknown>;
      idempotencyKey?: string | null;
      testMode?: boolean;
    };
    const result = await getWorkflowStore().enroll(user, orgId, {
      workflowId,
      leadId: body.leadId,
      conversationId: body.conversationId,
      context: body.context,
      idempotencyKey: body.idempotencyKey,
      testMode: body.testMode,
    });
    return jsonOk(result, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
