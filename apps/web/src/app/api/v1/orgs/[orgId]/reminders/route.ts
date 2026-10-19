import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCrmStore().listReminders(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      entityType?: string;
      entityId?: string;
      dueAt?: string;
      note?: string;
    };
    const item = await getCrmStore().createReminder(user, orgId, {
      entityType: body.entityType ?? "lead",
      entityId: body.entityId ?? "",
      dueAt: body.dueAt ?? new Date().toISOString(),
      note: body.note,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
