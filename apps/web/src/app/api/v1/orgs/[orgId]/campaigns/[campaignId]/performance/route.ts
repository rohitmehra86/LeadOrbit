import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; campaignId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, campaignId } = await ctx.params;
    const user = await requireUser();
    const item = await getCampaignStore().campaignPerformance(
      user,
      orgId,
      campaignId,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
