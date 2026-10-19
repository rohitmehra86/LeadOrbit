import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const items = await getCrmStore().listOpportunities(user, orgId);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      amount?: number;
      currency?: string;
      leadId?: string;
    };
    const item = await getCrmStore().createOpportunity(user, orgId, {
      name: body.name ?? "Untitled deal",
      amount: body.amount,
      currency: body.currency,
      leadId: body.leadId,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
