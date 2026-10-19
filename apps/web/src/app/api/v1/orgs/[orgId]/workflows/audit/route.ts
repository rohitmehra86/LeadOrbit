import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getWorkflowStore().listAudit(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}
