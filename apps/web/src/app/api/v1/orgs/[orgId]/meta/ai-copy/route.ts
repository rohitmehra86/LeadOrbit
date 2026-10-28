import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { suggestMetaAdCopy } from "@leadorbit/domain";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

/** Generate Meta ad copy via LLM gateway. Never publishes ads. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    await getCampaignStore().listCampaigns(user, orgId);

    const body = (await request.json()) as {
      businessOrOffer?: string;
      geo?: string | null;
      audienceBasics?: string | null;
      landingPageUrl?: string | null;
      tone?: string | null;
    };
    if (!body.businessOrOffer?.trim()) {
      return jsonProblem(400, "Validation Error", "businessOrOffer is required");
    }

    const result = await suggestMetaAdCopy({
      businessOrOffer: body.businessOrOffer.trim(),
      geo: body.geo ?? null,
      audienceBasics: body.audienceBasics ?? null,
      landingPageUrl: body.landingPageUrl ?? null,
      tone: body.tone ?? null,
    });

    const http =
      result.status === "ready"
        ? 200
        : result.status === "pending_configuration"
          ? 409
          : 200;

    return jsonOk({ item: result }, { status: http });
  } catch (err) {
    return fromAuthError(err);
  }
}
