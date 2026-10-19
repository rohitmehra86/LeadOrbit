import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getInboxStore } from "@/lib/tenancy/inbox";
import type { InboxChannel } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getInboxStore().listTemplates(user, orgId) });
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
      key?: string;
      name?: string;
      body?: string;
    };
    const item = await getInboxStore().createTemplate(user, orgId, {
      channel: body.channel ?? "email",
      key: body.key ?? `tpl_${Date.now()}`,
      name: body.name ?? "Template",
      body: body.body ?? "",
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
