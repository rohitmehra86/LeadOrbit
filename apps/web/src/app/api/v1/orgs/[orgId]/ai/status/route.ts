import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getAiStore } from "@/lib/tenancy/ai";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    // Touch org membership via list (read gate)
    await getAiStore().listPersonas(user, orgId);
    return jsonOk({ gateway: getAiStore().gatewayInfo() });
  } catch (err) {
    return fromAuthError(err);
  }
}
