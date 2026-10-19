import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; pageId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId, pageId } = await ctx.params;
    const user = await requireUser();
    const item = await getCampaignStore().publishPage(user, orgId, pageId);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
