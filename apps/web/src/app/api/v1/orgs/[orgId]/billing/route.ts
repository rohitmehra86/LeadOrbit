import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getBillingStore } from "@/lib/tenancy/billing";
import { DEFAULT_PLANS } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

/** Subscription, plans, invoices, provider status. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getBillingStore();
    const subscription = await store.getSubscription(user, orgId);
    const invoices = await store.listInvoices(user, orgId);
    const providers = await store.providerStatus(user, orgId);
    const listedPlans = await Promise.resolve(store.listPlans());
    return jsonOk({
      subscription,
      invoices,
      providers,
      plans: listedPlans.length ? listedPlans : DEFAULT_PLANS,
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

/** Checkout / plan change / cancel — never activates from client success alone. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getBillingStore();
    const body = (await request.json()) as {
      action: "checkout" | "change_plan" | "cancel";
      planCode?: string;
      provider?: "stripe" | "razorpay" | "manual";
      mode?: "upgrade" | "downgrade";
      atPeriodEnd?: boolean;
    };

    if (body.action === "checkout") {
      if (!body.planCode || !body.provider) {
        return jsonOk({ error: "planCode and provider required" }, { status: 400 });
      }
      const result = await store.startCheckout(user, orgId, {
        planCode: body.planCode,
        provider: body.provider,
      });
      return jsonOk(result);
    }

    if (body.action === "change_plan") {
      if (!body.planCode) {
        return jsonOk({ error: "planCode required" }, { status: 400 });
      }
      const sub = await store.changePlan(
        user,
        orgId,
        body.planCode,
        body.mode ?? "upgrade",
      );
      return jsonOk({ subscription: sub });
    }

    if (body.action === "cancel") {
      const sub = await store.cancelSubscription(
        user,
        orgId,
        body.atPeriodEnd ?? true,
      );
      return jsonOk({ subscription: sub });
      }

    return jsonOk({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fromAuthError(err);
  }
}
