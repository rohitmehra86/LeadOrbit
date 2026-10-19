import { fromAuthError, jsonOk } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";
import { getWorkflowStore } from "@/lib/tenancy/workflows";
import type { InboxChannel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; channel: string }> };

/**
 * Signed inbound messaging webhook.
 * Headers: X-LeadOrbit-Timestamp, X-LeadOrbit-Signature
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, channel } = await ctx.params;
    const rawBody = await request.text();
    const timestamp =
      request.headers.get("x-leadorbit-timestamp") ||
      request.headers.get("X-LeadOrbit-Timestamp") ||
      "";
    const signature =
      request.headers.get("x-leadorbit-signature") ||
      request.headers.get("X-LeadOrbit-Signature") ||
      "";
    const result = await getInboxStore().processInboundWebhook({
      orgId,
      channel: channel as InboxChannel,
      rawBody,
      timestamp,
      signature,
    });
    // Enqueue matching workflows (durable) — do not execute here.
    await getWorkflowStore().dispatchTrigger({
      orgId,
      trigger: "message_received",
      conversationId: result.conversationId,
      context: { channel, messageId: result.messageId },
      idempotencyPrefix: `msg:${result.messageId}`,
    });
    return jsonOk(result, { status: 202 });
  } catch (err) {
    return fromAuthError(err);
  }
}
