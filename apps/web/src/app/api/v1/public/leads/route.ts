import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";
import { getLocalTenancyStore, getAuthMode, AuthError } from "@leadorbit/db";

/**
 * Public capture endpoint. Requires X-Org-Id + X-Capture-Token headers.
 * Local mode: token must equal DEV_CAPTURE_TOKEN (default "dev-capture").
 * Idempotency-Key header supported.
 */
export async function POST(request: Request) {
  try {
    if (getAuthMode() !== "local") {
      return jsonProblem(
        501,
        "Not Implemented",
        "Public capture against Supabase form tokens lands with Milestone 3+ wiring.",
      );
    }
    const orgId = request.headers.get("x-org-id");
    const token = request.headers.get("x-capture-token");
    const expected = process.env.DEV_CAPTURE_TOKEN || "dev-capture";
    if (!orgId || token !== expected) {
      throw new AuthError("Invalid capture credentials", "unauthorized");
    }
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      phone?: string;
      source?: string;
    };
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      request.headers.get("Idempotency-Key") ||
      undefined;

    // Act as org owner for capture writes
    const tenancy = getLocalTenancyStore();
    const members = await tenancy.listMembers(
      {
        id: "capture",
        email: "capture@local",
        fullName: null,
        isPlatformAdmin: true,
      },
      orgId,
    );
    const owner = members.find((m) => m.role === "owner");
    if (!owner) throw new AuthError("Organization not found", "not_found");
    const actor = await tenancy.getUser(owner.userId);
    if (!actor) throw new AuthError("Organization owner missing", "not_found");

    getCrmStore().registerOrg(orgId, orgId);
    const item = await getCrmStore().createLead(actor, orgId, {
      fullName: body.fullName ?? "Website lead",
      email: body.email,
      phone: body.phone,
      source: body.source ?? "public_form",
      idempotencyKey: idempotencyKey ?? null,
      assignStrategy: "round_robin",
    });
    return jsonOk({ id: item.id, status: item.status }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
