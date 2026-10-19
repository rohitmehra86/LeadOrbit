import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getKnowledgeStore } from "@/lib/tenancy/knowledge";
import type { KnowledgeDocKind } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      query?: string;
      collectionId?: string;
      kind?: KnowledgeDocKind;
      limit?: number;
    };
    const out = await getKnowledgeStore().retrieve(user, orgId, {
      query: body.query ?? "",
      collectionId: body.collectionId,
      kind: body.kind,
      limit: body.limit,
    });
    return jsonOk(out);
  } catch (err) {
    return fromAuthError(err);
  }
}
