import { fromAuthError, jsonOk } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";

type Ctx = { params: Promise<{ orgId: string; endpointId: string }> };

/**
 * Signed inbound webhook.
 * Headers: X-LeadOrbit-Timestamp, X-LeadOrbit-Signature (sha256=hex)
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, endpointId } = await ctx.params;
    const rawBody = await request.text();
    const timestamp =
      request.headers.get("x-leadorbit-timestamp") ||
      request.headers.get("X-LeadOrbit-Timestamp") ||
      "";
    const signature =
      request.headers.get("x-leadorbit-signature") ||
      request.headers.get("X-LeadOrbit-Signature") ||
      "";
    const result = await getIngestionStore().processInboundWebhook({
      orgId,
      endpointId,
      rawBody,
      timestamp,
      signature,
    });
    return jsonOk(
      {
        eventId: result.event.id,
        leadId: result.leadId,
        status: result.event.status,
        duplicate: result.duplicate,
        campaignId: result.event.campaignId,
      },
      { status: result.duplicate ? 200 : 202 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
