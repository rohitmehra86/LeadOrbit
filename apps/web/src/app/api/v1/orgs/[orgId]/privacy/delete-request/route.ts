import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";
import { hasPermission } from "@leadorbit/domain";
import { randomUUID } from "node:crypto";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * Account/org data deletion request scaffolding. Records intent only —
 * irreversible purge is not auto-executed in local runtime.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const tenancy = getTenancyStore();
    await tenancy.getOrganization(user, orgId);
    const membership = await tenancy.getMembership(user.id, orgId);
    if (
      !user.isPlatformAdmin &&
      (!membership || !hasPermission(membership.role, "org:write"))
    ) {
      return jsonOk({ error: "Forbidden — org:write required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      confirm?: string;
    };
    if (body.confirm !== "DELETE") {
      return jsonOk(
        {
          status: "validation_error",
          detail: 'Send { "confirm": "DELETE" } to open a deletion request',
        },
        { status: 400 },
      );
    }

    const requestId = randomUUID();
    return jsonOk({
      status: "scaffolded",
      requestId,
      orgId,
      requestedBy: user.id,
      reason: body.reason ?? null,
      detail:
        "Deletion request recorded as scaffold — purge job / legal hold workflow not automated",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
