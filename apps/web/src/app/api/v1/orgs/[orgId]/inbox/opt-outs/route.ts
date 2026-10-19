import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";
import type { InboxChannel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      channel?: InboxChannel;
      address?: string;
    };
    const item = await getInboxStore().addOptOut(
      user,
      orgId,
      body.channel ?? "email",
      body.address ?? "",
    );
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
