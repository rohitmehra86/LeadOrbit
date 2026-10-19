import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; formId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId, formId } = await ctx.params;
    const user = await requireUser();
    const item = await getCampaignStore().duplicateForm(user, orgId, formId);
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
