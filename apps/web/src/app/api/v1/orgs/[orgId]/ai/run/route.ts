import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getAiStore } from "@/lib/tenancy/ai";
import type { AiChannel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      text?: string;
      channel?: AiChannel;
      personaId?: string;
      leadId?: string | null;
      conversationId?: string | null;
      locale?: string;
    };
    if (!body.text?.trim()) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/400",
          title: "validation",
          status: 400,
          detail: "text is required",
        },
        { status: 400 },
      );
    }
    const result = await getAiStore().runTurn(user, orgId, {
      text: body.text,
      channel: body.channel,
      personaId: body.personaId,
      leadId: body.leadId,
      conversationId: body.conversationId,
      locale: body.locale,
    });
    return jsonOk({ result });
  } catch (err) {
    return fromAuthError(err);
  }
}
