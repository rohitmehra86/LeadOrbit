import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";
import type { AssignmentRule } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCrmStore().listAssignmentRules(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as Omit<AssignmentRule, "orgId">;
    const item = await getCrmStore().upsertAssignmentRule(user, orgId, body);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
