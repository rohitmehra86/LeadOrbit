import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as { email?: string; phone?: string };
    const items = await getCrmStore().findDuplicates(user, orgId, body);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
