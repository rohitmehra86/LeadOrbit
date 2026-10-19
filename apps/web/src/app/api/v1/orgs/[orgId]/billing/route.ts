import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Entitlements + usage quotas scaffolding (Stripe/Razorpay wiring is Milestone 8). */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getTenancyStore();
    const entitlement = await store.getEntitlements(user, orgId);
    const quotas = await store.listQuotas(user, orgId);
    return jsonOk({ entitlement, quotas });
  } catch (err) {
    return fromAuthError(err);
  }
}
