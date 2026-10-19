import { fromAuthError, jsonOk } from "@/lib/api/http";
import { getCalendarStore } from "@/lib/tenancy/calendar";

type Ctx = { params: Promise<{ orgId: string; slug: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, slug } = await ctx.params;
    const page = getCalendarStore().getPublicBookingPage(orgId, slug);
    if (!page) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/404",
          title: "not_found",
          status: 404,
          detail: "Booking page not found",
        },
        { status: 404 },
      );
    }
    return jsonOk({ page });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, slug } = await ctx.params;
    const store = getCalendarStore();
    const page = store.getPublicBookingPage(orgId, slug);
    if (!page) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/404",
          title: "not_found",
          status: 404,
          detail: "Booking page not found",
        },
        { status: 404 },
      );
    }
    const body = (await request.json()) as {
      startsAt?: string;
      leadId?: string | null;
      siteVisitAddress?: string | null;
      notes?: string | null;
      assigneeUserId?: string | null;
    };
    if (!body.startsAt) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/400",
          title: "validation",
          status: 400,
          detail: "startsAt required",
        },
        { status: 400 },
      );
    }
    const assignee =
      body.assigneeUserId ?? page.assignedUserIds[0] ?? null;
    const item = await store.bookAppointment(null, orgId, {
      appointmentTypeId: page.appointmentTypeId,
      bookingPageId: page.id,
      leadId: body.leadId,
      assigneeUserId: assignee,
      startsAt: body.startsAt,
      siteVisitAddress: body.siteVisitAddress,
      notes: body.notes,
      title: page.title,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
