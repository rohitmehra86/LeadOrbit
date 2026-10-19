import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCalendarStore } from "@/lib/tenancy/calendar";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({
      items: await getCalendarStore().listBookingPages(user, orgId),
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
      slug?: string;
      title?: string;
      appointmentTypeId?: string;
      timezone?: string;
      assignedUserIds?: string[];
      public?: boolean;
    };
    if (!body.appointmentTypeId || !body.slug) {
      return jsonOk(
        {
          type: "https://leadorbit.dev/problems/400",
          title: "validation",
          status: 400,
          detail: "slug and appointmentTypeId required",
        },
        { status: 400 },
      );
    }
    const item = await getCalendarStore().createBookingPage(user, orgId, {
      slug: body.slug,
      title: body.title ?? body.slug,
      appointmentTypeId: body.appointmentTypeId,
      timezone: body.timezone,
      assignedUserIds: body.assignedUserIds,
      public: body.public,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
