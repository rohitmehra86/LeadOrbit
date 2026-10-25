import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { getBillingStore } from "@/lib/tenancy/billing";
import type { SubscriptionStatus } from "@leadorbit/domain";

/** Super-admin billing controls. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user.isPlatformAdmin) {
      return jsonProblem(403, "Platform admin required");
    }
    const body = (await request.json()) as {
      orgId: string;
      planCode?: string;
      status?: SubscriptionStatus;
      seatsIncluded?: number;
      aiCreditsIncluded?: number;
    };
    if (!body.orgId) return jsonProblem(400, "orgId required");
    const subscription = await getBillingStore().platformSetSubscription(
      user,
      body.orgId,
      body,
    );
    return jsonOk({ subscription });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.isPlatformAdmin) {
      return jsonProblem(403, "Platform admin required");
    }
    const events = await Promise.resolve(getBillingStore().listWebhookEvents());
    return jsonOk({ webhookEvents: events });
  } catch (err) {
    return fromAuthError(err);
  }
}
