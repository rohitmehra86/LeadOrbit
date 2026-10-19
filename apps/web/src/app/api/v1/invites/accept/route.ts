import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { token?: string };
    const membership = await getTenancyStore().acceptInvite(user, body.token ?? "");
    return jsonOk({
      item: {
        id: membership.id,
        orgId: membership.orgId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
