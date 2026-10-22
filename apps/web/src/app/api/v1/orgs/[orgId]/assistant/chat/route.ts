import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { runAssistantChat } from "@/lib/assistant/execute";
import type { MetaLaunchPlan } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      message?: string;
      approve?: boolean;
      pendingPack?: {
        formId: string;
        pageId: string;
        pageSlug: string;
        campaignId: string;
      } | null;
      pendingMetaPlan?: {
        plan: MetaLaunchPlan;
        campaignId: string;
      } | null;
    };
    if (!body.message?.trim()) {
      return jsonProblem(400, "Validation Error", "message is required");
    }
    const result = await runAssistantChat(user, orgId, {
      message: body.message,
      approve: Boolean(body.approve),
      pendingPack: body.pendingPack ?? null,
      pendingMetaPlan: body.pendingMetaPlan ?? null,
    });
    return jsonOk(result);
  } catch (err) {
    return fromAuthError(err);
  }
}
