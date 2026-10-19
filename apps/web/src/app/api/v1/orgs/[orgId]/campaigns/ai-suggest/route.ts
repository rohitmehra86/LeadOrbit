import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    // Gate membership via a cheap read
    await getCampaignStore().listCampaigns(user, orgId);
    const body = (await request.json()) as { prompt?: string };
    const item = getCampaignStore().suggestCopy(body.prompt ?? "campaign copy");
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
