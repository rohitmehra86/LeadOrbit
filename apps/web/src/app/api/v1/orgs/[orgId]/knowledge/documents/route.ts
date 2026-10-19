import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getKnowledgeStore } from "@/lib/tenancy/knowledge";
import type { KnowledgeDocKind } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getKnowledgeStore();
    return jsonOk({
      backend: store.backendStatus(),
      items: await store.listDocuments(user, orgId),
      collections: await store.listCollections(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      title?: string;
      kind?: KnowledgeDocKind;
      rawText?: string;
      collectionId?: string;
      mimeType?: string | null;
      metadata?: Record<string, unknown>;
    };
    const out = await getKnowledgeStore().uploadDocument(user, orgId, {
      title: body.title ?? "Untitled",
      kind: body.kind ?? "text",
      rawText: body.rawText ?? "",
      collectionId: body.collectionId,
      mimeType: body.mimeType,
      metadata: body.metadata,
    });
    return jsonOk(out, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
