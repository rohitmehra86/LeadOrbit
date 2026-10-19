import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";
import type { AttributionModel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; leadId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, leadId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      opportunityId?: string;
      model?: AttributionModel;
    };
    if (!body.opportunityId) {
      return jsonOk({ error: "opportunityId required" }, { status: 400 });
    }
    const item = await getIngestionStore().linkOpportunityAttribution(
      user,
      orgId,
      leadId,
      body.opportunityId,
      body.model ?? "last_touch",
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
