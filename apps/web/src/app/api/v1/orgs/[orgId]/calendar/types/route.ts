import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCalendarStore } from "@/lib/tenancy/calendar";
import type { AppointmentKind } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getCalendarStore().listAppointmentTypes(user, orgId),
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
      name?: string;
      kind?: AppointmentKind;
      durationMinutes?: number;
      bufferBeforeMinutes?: number;
      bufferAfterMinutes?: number;
      timezone?: string;
      requiresSiteVisit?: boolean;
      description?: string | null;
    };
    const item = await getCalendarStore().createAppointmentType(user, orgId, {
      name: body.name ?? "Appointment",
      kind: body.kind,
      durationMinutes: body.durationMinutes,
      bufferBeforeMinutes: body.bufferBeforeMinutes,
      bufferAfterMinutes: body.bufferAfterMinutes,
      timezone: body.timezone,
      requiresSiteVisit: body.requiresSiteVisit,
      description: body.description,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
