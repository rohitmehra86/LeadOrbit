import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const members = await getTenancyStore().listMembers(user, orgId);
    return jsonOk({
      items: members.map((m) => ({
        id: m.id,
        orgId: m.orgId,
        userId: m.userId,
        role: m.role,
        status: m.status,
      })),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
