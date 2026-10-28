import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import {
  fetchMetaObjectStatus,
  metaAdsManagerObjectUrl,
  parseMetaIdsFromAdCopy,
  updateMetaObjectConfiguredStatus,
} from "@leadorbit/domain";
import { getMetaConnectionSecrets } from "@/lib/meta/meta-connections";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

function resolveObjectId(
  ids: ReturnType<typeof parseMetaIdsFromAdCopy>,
  objectType: "campaign" | "adset" | "ad",
): string | null {
  if (objectType === "campaign") return ids.campaignId;
  if (objectType === "adset") return ids.adSetId;
  return ids.adId;
}

/** Refresh Meta status for campaign / ad set / ad (by Meta id or local campaign). */
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const objectTypeParam = url.searchParams.get("objectType") || "campaign";
    const objectType =
      objectTypeParam === "adset" || objectTypeParam === "ad"
        ? objectTypeParam
        : "campaign";
    let objectId = url.searchParams.get("objectId")?.trim() || "";
    const localCampaignId = url.searchParams.get("campaignId");

    const secrets = await getMetaConnectionSecrets(user, orgId);
    if (!secrets?.accessToken) {
      return jsonProblem(
        409,
        "Pending Configuration",
        "Connect Meta for this organization first",
      );
    }

    if (!objectId && localCampaignId) {
      const campaign = await getCampaignStore().getCampaign(
        user,
        orgId,
        localCampaignId,
      );
      const ids = parseMetaIdsFromAdCopy(campaign?.adCopy ?? null);
      objectId = resolveObjectId(ids, objectType) ?? "";
    }
    if (!objectId) {
      return jsonProblem(400, "Validation Error", "objectId or campaignId required");
    }

    const result = await fetchMetaObjectStatus(secrets.accessToken, objectId);
    if (!result.ok) {
      return jsonOk({ item: result }, { status: 502 });
    }

    const adsManagerUrl = metaAdsManagerObjectUrl({
      adAccountId: secrets.adAccountId,
      objectType,
      objectId,
    });

    return jsonOk({
      item: {
        ...result.object,
        adsManagerUrl,
        adAccountId: secrets.adAccountId,
        pageId: secrets.pageId,
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

/**
 * Pause or resume a Meta object. Requires explicit confirm=true.
 * ACTIVE may incur spend — never call without UI confirmation.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      objectId?: string;
      objectType?: "campaign" | "adset" | "ad";
      campaignId?: string;
      status?: "PAUSED" | "ACTIVE";
      confirm?: boolean;
    };

    if (body.confirm !== true) {
      return jsonProblem(
        400,
        "Validation Error",
        "confirm must be true — status changes require explicit confirmation",
      );
    }
    if (body.status !== "PAUSED" && body.status !== "ACTIVE") {
      return jsonProblem(400, "Validation Error", "status must be PAUSED or ACTIVE");
    }

    const secrets = await getMetaConnectionSecrets(user, orgId);
    if (!secrets?.accessToken) {
      return jsonProblem(
        409,
        "Pending Configuration",
        "Connect Meta for this organization first",
      );
    }

    const objectType = body.objectType ?? "campaign";
    let objectId = body.objectId?.trim() || "";
    if (!objectId && body.campaignId) {
      const campaign = await getCampaignStore().getCampaign(
        user,
        orgId,
        body.campaignId,
      );
      const ids = parseMetaIdsFromAdCopy(campaign?.adCopy ?? null);
      objectId = resolveObjectId(ids, objectType) ?? "";
    }
    if (!objectId) {
      return jsonProblem(400, "Validation Error", "objectId or campaignId required");
    }

    const result = await updateMetaObjectConfiguredStatus(
      secrets.accessToken,
      objectId,
      body.status,
    );
    if (!result.ok) {
      return jsonOk({ item: result }, { status: 502 });
    }

    if (body.campaignId && objectType === "campaign") {
      await getCampaignStore().updateCampaign(user, orgId, body.campaignId, {
        status: body.status === "ACTIVE" ? "active" : "paused",
      });
    }

    return jsonOk({
      item: {
        ...result,
        adsManagerUrl: metaAdsManagerObjectUrl({
          adAccountId: secrets.adAccountId,
          objectType,
          objectId,
        }),
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
