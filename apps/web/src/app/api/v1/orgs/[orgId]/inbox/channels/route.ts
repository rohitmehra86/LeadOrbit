import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";
import type { InboxChannel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getInboxStore().listChannelConnections(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as { channel?: InboxChannel };
    const item = await getInboxStore().authorizeChannel(
      user,
      orgId,
      body.channel ?? "whatsapp",
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
