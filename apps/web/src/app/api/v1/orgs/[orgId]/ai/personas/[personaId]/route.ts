import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getAiStore } from "@/lib/tenancy/ai";
import type { AiChannel, AiHandoffRules, AiPolicies, AiToolName } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; personaId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, personaId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      systemPrompt?: string;
      locale?: string;
      tone?: string;
      allowedTools?: AiToolName[];
      allowedChannels?: AiChannel[];
      policies?: Partial<AiPolicies>;
      handoffRules?: Partial<AiHandoffRules>;
      knowledgeCollectionIds?: string[];
      enabled?: boolean;
      bumpPromptVersion?: boolean;
      promptNote?: string | null;
    };
    const item = await getAiStore().updatePersona(user, orgId, personaId, body);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, personaId } = await ctx.params;
    const user = await requireUser();
    const versions = await getAiStore().listPromptVersions(user, orgId, personaId);
    return jsonOk({ versions });
  } catch (err) {
    return fromAuthError(err);
  }
}
