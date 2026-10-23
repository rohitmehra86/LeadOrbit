import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import {
  clearMetaOAuthPending,
  loadMetaOAuthPending,
  upsertMetaConnection,
} from "@/lib/meta/meta-connections";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

/** Finish Connect Meta after user picks ad account + page. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      nonce?: string;
      adAccountId?: string;
      pageId?: string;
    };
    if (!body.nonce || !body.adAccountId || !body.pageId) {
      return jsonProblem(
        400,
        "Validation Error",
        "nonce, adAccountId, and pageId are required",
      );
    }
    const pending = await loadMetaOAuthPending(body.nonce);
    if (!pending || pending.orgId !== orgId || pending.userId !== user.id) {
      return jsonProblem(400, "Validation Error", "OAuth session expired");
    }
    if (!pending.accessToken) {
      return jsonProblem(400, "Validation Error", "OAuth token not ready");
    }
    const connection = await upsertMetaConnection(user, orgId, {
      accessToken: pending.accessToken,
      adAccountId: body.adAccountId,
      pageId: body.pageId,
      tokenExpiresAt: pending.tokenExpiresAt,
    });
    await clearMetaOAuthPending(orgId);
    await getCampaignStore().authorizeAdNetwork(user, orgId, "meta");
    return jsonOk({ item: connection, status: "connected" }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
