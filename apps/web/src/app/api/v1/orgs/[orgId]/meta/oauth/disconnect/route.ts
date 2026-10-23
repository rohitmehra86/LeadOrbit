import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { deleteMetaConnection } from "@/lib/meta/meta-connections";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    await deleteMetaConnection(user, orgId);
    await getCampaignStore().authorizeAdNetwork(user, orgId, "meta");
    return jsonOk({ status: "disconnected" });
  } catch (err) {
    return fromAuthError(err);
  }
}
