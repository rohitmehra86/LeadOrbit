import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getVoiceStore } from "@/lib/tenancy/voice";
import type { VoiceProvider } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getVoiceStore();
    return jsonOk({
      items: await store.listCalls(user, orgId),
      analytics: await store.analytics(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      direction?: "inbound" | "outbound";
      provider?: VoiceProvider;
      fromNumber?: string;
      toNumber?: string;
      leadId?: string | null;
      recordingConsent?: boolean;
      aiAssisted?: boolean;
    };
    const store = getVoiceStore();
    if (body.direction === "inbound") {
      const item = await store.acceptInboundCall(user, orgId, {
        provider: body.provider,
        fromNumber: body.fromNumber ?? "unknown",
        toNumber: body.toNumber ?? "unknown",
        leadId: body.leadId,
        recordingConsent: body.recordingConsent,
        aiAssisted: body.aiAssisted,
      });
      return jsonOk({ item }, { status: 201 });
    }
    if (!body.toNumber) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/400",
          title: "validation",
          status: 400,
          detail: "toNumber required for outbound",
        },
        { status: 400 },
      );
    }
    const item = await store.startOutboundCall(user, orgId, {
      provider: body.provider,
      toNumber: body.toNumber,
      fromNumber: body.fromNumber,
      leadId: body.leadId,
      recordingConsent: Boolean(body.recordingConsent),
      aiAssisted: body.aiAssisted,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
