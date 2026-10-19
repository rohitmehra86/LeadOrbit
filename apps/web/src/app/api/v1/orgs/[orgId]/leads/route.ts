import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";
import type { AssignmentStrategy } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const items = await getCrmStore().listLeads(user, orgId, {
      ownerUserId: url.searchParams.get("ownerUserId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      stageId: url.searchParams.get("stageId") ?? undefined,
    });
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      phone?: string;
      source?: string;
      territory?: string;
      ownerUserId?: string;
      idempotencyKey?: string;
      assignStrategy?: AssignmentStrategy;
      slaHours?: number;
      customFields?: Record<string, unknown>;
    };
    const item = await getCrmStore().createLead(user, orgId, {
      fullName: body.fullName ?? "",
      email: body.email,
      phone: body.phone,
      source: body.source,
      territory: body.territory,
      ownerUserId: body.ownerUserId,
      idempotencyKey: body.idempotencyKey,
      assignStrategy: body.assignStrategy,
      slaHours: body.slaHours,
      customFields: body.customFields,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
