import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";
import { getCrmDatabase } from "@leadorbit/db";
import { hasPermission } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * Data export request scaffolding (GDPR-style). Returns a JSON package of
 * org-owned rows the actor can read — not a full legal compliance product.
 */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const tenancy = getTenancyStore();
    await tenancy.getOrganization(user, orgId);
    const membership = await tenancy.getMembership(user.id, orgId);
    if (
      !user.isPlatformAdmin &&
      (!membership || !hasPermission(membership.role, "org:read"))
    ) {
      return jsonOk({ error: "Forbidden" }, { status: 403 });
    }

    const db = getCrmDatabase();
    const leads = db
      .prepare(
        `select id, full_name, email, phone, source, status, created_at from leads where org_id=? limit 5000`,
      )
      .all(orgId);
    const members = await tenancy.listMembers(user, orgId);

    return jsonOk({
      status: "scaffolded",
      detail:
        "Export package generated locally — async delivery / zip storage not configured",
      generatedAt: new Date().toISOString(),
      orgId,
      requestedBy: user.id,
      package: {
        members: members.map((m) => ({
          userId: m.userId,
          role: m.role,
          status: m.status,
        })),
        leads,
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
