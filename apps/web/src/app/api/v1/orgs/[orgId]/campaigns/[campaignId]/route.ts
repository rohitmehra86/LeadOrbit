import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { Campaign, CampaignObjective, CampaignStatus, UtmParams } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; campaignId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, campaignId } = await ctx.params;
    const user = await requireUser();
    const item = await getCampaignStore().getCampaign(user, orgId, campaignId);
    if (!item) return jsonProblem(404, "Not Found", "Campaign not found");
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, campaignId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as Partial<{
      name: string;
      objective: CampaignObjective;
      status: CampaignStatus;
      adCopy: string;
      audience: Campaign["audience"];
      budget: Campaign["budget"];
      scheduleStart: string | null;
      scheduleEnd: string | null;
      landingPageId: string | null;
      formId: string | null;
      abTestEnabled: boolean;
      abVariants: Campaign["abVariants"];
      attributionModel: Campaign["attributionModel"];
      utm: UtmParams;
    }>;
    const item = await getCampaignStore().updateCampaign(
      user,
      orgId,
      campaignId,
      body,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
