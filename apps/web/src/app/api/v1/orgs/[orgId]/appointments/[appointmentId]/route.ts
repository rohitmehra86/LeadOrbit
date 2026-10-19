import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCalendarStore } from "@/lib/tenancy/calendar";

type Ctx = { params: Promise<{ orgId: string; appointmentId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, appointmentId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      action?: "reschedule" | "cancel" | "assign";
      startsAt?: string;
      assigneeUserId?: string;
    };
    const store = getCalendarStore();
    if (body.action === "cancel") {
      return jsonOk({
        item: await store.cancelAppointment(user, orgId, appointmentId),
      });
    }
    if (body.action === "reschedule" && body.startsAt) {
      return jsonOk({
        item: await store.rescheduleAppointment(
          user,
          orgId,
          appointmentId,
          body.startsAt,
        ),
      });
    }
    if (body.action === "assign" && body.assigneeUserId) {
      return jsonOk({
        item: await store.assignAgent(
          user,
          orgId,
          appointmentId,
          body.assigneeUserId,
        ),
      });
    }
    return jsonOk(
      {
        type: "https://leadorbit.dev/problems/400",
        title: "validation",
        status: 400,
        detail: "Unknown action",
      },
      { status: 400 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
