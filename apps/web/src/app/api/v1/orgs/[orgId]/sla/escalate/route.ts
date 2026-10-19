import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const escalated = await getCrmStore().escalateOverdueLeads(user, orgId);
    return jsonOk({ escalated });
  } catch (err) {
    return fromAuthError(err);
  }
}
