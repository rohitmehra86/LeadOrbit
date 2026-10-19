import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getBillingStore } from "@/lib/tenancy/billing";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const feature = new URL(request.url).searchParams.get("feature") ?? "analytics";
    const result = await getBillingStore().assertEntitled(user, orgId, feature);
    return jsonOk(result);
  } catch (err) {
    return fromAuthError(err);
  }
}
