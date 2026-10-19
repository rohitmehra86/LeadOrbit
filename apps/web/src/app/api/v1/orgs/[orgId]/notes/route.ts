import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";
import type { Note } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      body?: string;
      entityType?: Note["entityType"];
      entityId?: string;
    };
    const item = await getCrmStore().addNote(user, orgId, {
      body: body.body ?? "",
      entityType: body.entityType ?? "lead",
      entityId: body.entityId ?? "",
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
