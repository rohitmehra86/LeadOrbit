import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCalendarStore } from "@/lib/tenancy/calendar";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getCalendarStore().listAppointments(user, orgId),
      reminders: await getCalendarStore().listReminders(user, orgId),
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
      appointmentTypeId?: string;
      bookingPageId?: string | null;
      leadId?: string | null;
      assigneeUserId?: string | null;
      startsAt?: string;
      title?: string;
      location?: string | null;
      siteVisitAddress?: string | null;
      notes?: string | null;
      reminderMinutesBefore?: number;
    };
    if (!body.appointmentTypeId || !body.startsAt) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/400",
          title: "validation",
          status: 400,
          detail: "appointmentTypeId and startsAt required",
        },
        { status: 400 },
      );
    }
    const item = await getCalendarStore().bookAppointment(user, orgId, {
      appointmentTypeId: body.appointmentTypeId,
      bookingPageId: body.bookingPageId,
      leadId: body.leadId,
      assigneeUserId: body.assigneeUserId ?? user.id,
      startsAt: body.startsAt,
      title: body.title,
      location: body.location,
      siteVisitAddress: body.siteVisitAddress,
      notes: body.notes,
      reminderMinutesBefore: body.reminderMinutesBefore,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
