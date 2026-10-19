import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getKnowledgeStore } from "@/lib/tenancy/knowledge";

type Ctx = { params: Promise<{ orgId: string; documentId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, documentId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action === "reindex") {
      const item = await getKnowledgeStore().reindexDocument(
        user,
        orgId,
        documentId,
      );
      return jsonOk({ item });
    }
    return jsonOk(
      {
        type: "https://leadorbit.dev/problems/400",
        title: "validation",
        status: 400,
        detail: "Unknown action",
      },
      { status: 400 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { orgId, documentId } = await ctx.params;
    const user = await requireUser();
    await getKnowledgeStore().deleteDocument(user, orgId, documentId);
    return jsonOk({ ok: true });
  } catch (err) {
    return fromAuthError(err);
  }
}
