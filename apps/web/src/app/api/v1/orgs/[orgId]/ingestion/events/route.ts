import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getIngestionStore().listIngestionEvents(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
