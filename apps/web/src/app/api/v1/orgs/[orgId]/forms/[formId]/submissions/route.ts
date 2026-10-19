import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; formId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, formId } = await ctx.params;
    const user = await requireUser();
    const items = await getCampaignStore().listSubmissions(user, orgId, formId);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
