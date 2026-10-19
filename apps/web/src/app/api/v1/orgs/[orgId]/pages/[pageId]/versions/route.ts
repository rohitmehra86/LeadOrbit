import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; pageId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, pageId } = await ctx.params;
    const user = await requireUser();
    const items = await getCampaignStore().listPageVersions(user, orgId, pageId);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
