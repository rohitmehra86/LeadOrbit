import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";

type Ctx = { params: Promise<{ orgId: string; conversationId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, conversationId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getInboxStore().listMessages(user, orgId, conversationId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, conversationId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      body?: string;
      isInternalNote?: boolean;
      templateKey?: string | null;
      attachmentPaths?: string[];
      scheduleAt?: string | null;
    };
    const result = await getInboxStore().addMessage(user, orgId, {
      conversationId,
      body: body.body ?? "",
      isInternalNote: body.isInternalNote,
      templateKey: body.templateKey,
      attachmentPaths: body.attachmentPaths,
      scheduleAt: body.scheduleAt,
    });
    return jsonOk(result, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
