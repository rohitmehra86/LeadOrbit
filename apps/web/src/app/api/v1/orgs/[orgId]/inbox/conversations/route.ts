import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";
import type { InboxChannel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    return jsonOk({
      items: await getInboxStore().listConversations(user, orgId, {
        q: url.searchParams.get("q") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        channel: url.searchParams.get("channel") ?? undefined,
      }),
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
      channel?: InboxChannel;
      subject?: string;
      contactAddress?: string;
      leadId?: string | null;
      slaHours?: number;
    };
    const item = await getInboxStore().createConversation(user, orgId, {
      channel: body.channel ?? "website_chat",
      subject: body.subject,
      contactAddress: body.contactAddress,
      leadId: body.leadId,
      slaHours: body.slaHours,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
