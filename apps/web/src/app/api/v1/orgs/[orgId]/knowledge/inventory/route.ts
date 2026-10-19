import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getKnowledgeStore } from "@/lib/tenancy/knowledge";
import type { InventoryItem } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getKnowledgeStore().listInventory(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      sku?: string;
      name?: string;
      description?: string | null;
      price?: number | null;
      currency?: string;
      availability?: InventoryItem["availability"];
      category?: string | null;
    };
    if (!body.sku || !body.name) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/400",
          title: "validation",
          status: 400,
          detail: "sku and name required",
        },
        { status: 400 },
      );
    }
    const item = await getKnowledgeStore().upsertInventory(user, orgId, {
      sku: body.sku,
      name: body.name,
      description: body.description,
      price: body.price,
      currency: body.currency,
      availability: body.availability,
      category: body.category,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
