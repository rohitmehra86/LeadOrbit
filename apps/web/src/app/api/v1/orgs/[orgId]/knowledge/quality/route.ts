import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getKnowledgeStore } from "@/lib/tenancy/knowledge";
import type { RetrievalQualitySample } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as { samples?: RetrievalQualitySample[] };
    const items = await getKnowledgeStore().runRetrievalQuality(
      user,
      orgId,
      body.samples ?? [],
    );
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
