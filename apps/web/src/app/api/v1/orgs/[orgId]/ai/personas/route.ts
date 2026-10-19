import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getAiStore } from "@/lib/tenancy/ai";
import type { AiAgentKind, AiChannel, AiToolName } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getAiStore();
    let items = await store.listPersonas(user, orgId);
    if (items.length === 0) {
      items = [await store.ensureDefaultPersona(user, orgId)];
    }
    return jsonOk({ items });
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
      kind?: AiAgentKind;
      systemPrompt?: string;
      locale?: string;
      tone?: string;
      allowedTools?: AiToolName[];
      allowedChannels?: AiChannel[];
    };
    const item = await getAiStore().createPersona(user, orgId, body);
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
