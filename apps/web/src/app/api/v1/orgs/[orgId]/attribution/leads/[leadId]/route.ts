import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";

type Ctx = { params: Promise<{ orgId: string; leadId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, leadId } = await ctx.params;
    const user = await requireUser();
    const item = await getIngestionStore().getLeadAttribution(
      user,
      orgId,
      leadId,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
