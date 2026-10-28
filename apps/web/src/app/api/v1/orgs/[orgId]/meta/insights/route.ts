import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { fetchMetaObjectInsights } from "@leadorbit/domain";
import { getMetaConnectionSecrets } from "@/lib/meta/meta-connections";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { parseMetaIdsFromAdCopy } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * Read-only Meta insights for a campaign / ad set / ad owned via this org connection.
 * Never invents metrics. Empty delivery → empty:true.
 */
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    await getCampaignStore().listCampaigns(user, orgId);

    const url = new URL(request.url);
    let objectId = url.searchParams.get("objectId")?.trim() || "";
    const levelParam = url.searchParams.get("level") || "campaign";
    const level =
      levelParam === "adset" || levelParam === "ad" ? levelParam : "campaign";
    const datePreset = url.searchParams.get("datePreset") || "last_7d";
    const localCampaignId = url.searchParams.get("campaignId");

    const secrets = await getMetaConnectionSecrets(user, orgId);
    if (!secrets?.accessToken) {
      return jsonProblem(
        409,
        "Pending Configuration",
        "Connect Meta for this organization before loading insights",
      );
    }

    if (!objectId && localCampaignId) {
      const campaign = await getCampaignStore().getCampaign(
        user,
        orgId,
        localCampaignId,
      );
      const ids = parseMetaIdsFromAdCopy(campaign?.adCopy ?? null);
      objectId =
        level === "ad"
          ? ids.adId ?? ""
          : level === "adset"
            ? ids.adSetId ?? ""
            : ids.campaignId ?? "";
    }

    if (!objectId) {
      return jsonProblem(
        400,
        "Validation Error",
        "objectId or local campaignId with Meta ids required",
      );
    }

    const result = await fetchMetaObjectInsights({
      accessToken: secrets.accessToken,
      objectId,
      level,
      datePreset,
      currency: null,
    });

    if (!result.ok) {
      return jsonOk(
        {
          item: result,
          empty: true,
        },
        { status: 502 },
      );
    }

    return jsonOk({ item: result, empty: result.empty });
  } catch (err) {
    return fromAuthError(err);
  }
}
