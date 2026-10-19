import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";
import type { ConversationStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; conversationId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, conversationId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as Partial<{
      status: ConversationStatus;
      assigneeUserId: string | null;
      tags: string[];
      unreadCount: number;
    }>;
    const item = await getInboxStore().updateConversation(
      user,
      orgId,
      conversationId,
      body,
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
