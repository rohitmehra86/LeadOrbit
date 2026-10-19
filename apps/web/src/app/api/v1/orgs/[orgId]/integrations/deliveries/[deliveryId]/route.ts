import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";

type Ctx = { params: Promise<{ orgId: string; deliveryId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, deliveryId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      success?: boolean;
      statusCode?: number;
      error?: string;
    };
    const item = await getIngestionStore().syncDeliveryStatus(
      user,
      orgId,
      deliveryId,
      {
        success: Boolean(body.success),
        statusCode: body.statusCode,
        error: body.error,
      },
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
