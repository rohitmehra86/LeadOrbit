import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") ?? "lead";
    const entityId = url.searchParams.get("entityId") ?? "";
    const items = await getCrmStore().listActivities(user, orgId, entityType, entityId);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
