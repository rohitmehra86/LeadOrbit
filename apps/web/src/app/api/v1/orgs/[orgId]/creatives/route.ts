import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCampaignStore().listCreatives(user, orgId) });
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
      contentType?: string;
      storagePath?: string;
      width?: number | null;
      height?: number | null;
      tags?: string[];
    };
    const item = await getCampaignStore().createCreative(user, orgId, {
      name: body.name ?? "Asset",
      contentType: body.contentType ?? "image/png",
      storagePath: body.storagePath ?? `local://creatives/${Date.now()}`,
      width: body.width,
      height: body.height,
      tags: body.tags,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
