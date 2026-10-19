import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWorkflowStore } from "@/lib/tenancy/workflows";
import type { EnrollmentStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; enrollmentId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, enrollmentId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as { status?: EnrollmentStatus };
    const item = await getWorkflowStore().setEnrollmentStatus(
      user,
      orgId,
      enrollmentId,
      body.status ?? "paused",
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
