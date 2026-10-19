import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";
import type { CrmTask } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCrmStore().listTasks(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      title?: string;
      entityType?: CrmTask["entityType"];
      entityId?: string;
      dueAt?: string;
      description?: string;
    };
    const item = await getCrmStore().createTask(user, orgId, {
      title: body.title ?? "",
      entityType: body.entityType ?? "lead",
      entityId: body.entityId ?? "",
      dueAt: body.dueAt,
      description: body.description,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
