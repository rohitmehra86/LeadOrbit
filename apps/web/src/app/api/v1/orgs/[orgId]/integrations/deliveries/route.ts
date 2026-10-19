import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getIngestionStore().listDeliveries(user, orgId),
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
      targetUrl?: string;
      payload?: Record<string, unknown>;
      endpointId?: string | null;
    };
    const item = await getIngestionStore().enqueueOutboundDelivery(user, orgId, {
      targetUrl: body.targetUrl ?? "https://example.com/hook",
      payload: body.payload ?? {},
      endpointId: body.endpointId,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
