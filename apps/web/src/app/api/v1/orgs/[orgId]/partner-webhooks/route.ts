import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getPartnerWebhookStore } from "@/lib/tenancy/partner-webhooks";
import { PARTNER_EVENT_CATALOG } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getPartnerWebhookStore();
    const [subscriptions, deliveries, inbound] = await Promise.all([
      store.listSubscriptions(user, orgId),
      store.listDeliveries(user, orgId),
      store.listInboundEvents(user, orgId),
    ]);
    return jsonOk({
      catalog: PARTNER_EVENT_CATALOG,
      subscriptions,
      deliveries,
      inbound,
      inboundPath: `/api/v1/public/partners/${orgId}/webhooks`,
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getPartnerWebhookStore();
    const body = (await request.json()) as {
      action:
        | "create_subscription"
        | "set_enabled"
        | "emit_test"
        | "ensure_inbound_secret";
      name?: string;
      targetUrl?: string;
      eventTypes?: string[];
      description?: string;
      subscriptionId?: string;
      enabled?: boolean;
      rotate?: boolean;
    };

    if (body.action === "create_subscription") {
      if (!body.targetUrl) {
        return jsonOk({ error: "targetUrl required" }, { status: 400 });
      }
      const subscription = await store.createSubscription(user, orgId, {
        name: body.name ?? "Zapier / n8n hook",
        targetUrl: body.targetUrl,
        eventTypes: body.eventTypes,
        description: body.description ?? null,
      });
      return jsonOk({ subscription });
    }
    if (body.action === "set_enabled") {
      if (!body.subscriptionId || typeof body.enabled !== "boolean") {
        return jsonOk(
          { error: "subscriptionId and enabled required" },
          { status: 400 },
        );
      }
      const subscription = await store.setSubscriptionEnabled(
        user,
        orgId,
        body.subscriptionId,
        body.enabled,
      );
      return jsonOk({ subscription });
    }
    if (body.action === "emit_test") {
      const result = await store.emitTestEvent(
        user,
        orgId,
        body.subscriptionId,
      );
      return jsonOk(result);
    }
    if (body.action === "ensure_inbound_secret") {
      const secret = await store.ensureInboundSecret(
        user,
        orgId,
        Boolean(body.rotate),
      );
      return jsonOk(secret);
    }
    return jsonOk({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fromAuthError(err);
  }
}
