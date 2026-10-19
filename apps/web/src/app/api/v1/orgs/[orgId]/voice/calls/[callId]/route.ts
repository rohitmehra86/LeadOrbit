import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getVoiceStore } from "@/lib/tenancy/voice";

type Ctx = { params: Promise<{ orgId: string; callId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, callId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      action?: "transfer" | "book_appointment";
      assigneeUserId?: string;
      appointmentTypeId?: string;
      startsAt?: string;
      siteVisitAddress?: string | null;
    };
    const store = getVoiceStore();
    if (body.action === "transfer" && body.assigneeUserId) {
      return jsonOk({
        item: await store.transferToHuman(
          user,
          orgId,
          callId,
          body.assigneeUserId,
        ),
      });
    }
    if (
      body.action === "book_appointment" &&
      body.appointmentTypeId &&
      body.startsAt
    ) {
      return jsonOk(
        await store.bookAppointmentFromCall(user, orgId, callId, {
          appointmentTypeId: body.appointmentTypeId,
          startsAt: body.startsAt,
          siteVisitAddress: body.siteVisitAddress,
        }),
      );
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
