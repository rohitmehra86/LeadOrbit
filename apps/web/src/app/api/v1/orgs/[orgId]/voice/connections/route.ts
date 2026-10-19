import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getVoiceStore } from "@/lib/tenancy/voice";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getVoiceStore();
    return jsonOk({
      items: await store.listConnections(user, orgId),
      policy: await store.getPolicy(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      legalOutboundAllowed?: boolean;
      requireRecordingConsent?: boolean;
    };
    const policy = await getVoiceStore().updatePolicy(user, orgId, body);
    return jsonOk({ policy });
  } catch (err) {
    return fromAuthError(err);
  }
}
