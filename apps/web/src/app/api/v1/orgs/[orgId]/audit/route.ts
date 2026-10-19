import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const items = await getTenancyStore().listAudit(user, orgId);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
