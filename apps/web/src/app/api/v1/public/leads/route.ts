import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";
import { getAuthMode, AuthError } from "@leadorbit/db";
import type { UtmParams } from "@leadorbit/domain";

/**
 * Public capture via ingestion pipeline.
 * Requires X-Org-Id + X-Capture-Token. Idempotency-Key supported.
 */
export async function POST(request: Request) {
  try {
    if (getAuthMode() !== "local") {
      return jsonProblem(
        501,
        "Not Implemented",
        "Public capture against Supabase form tokens lands when Supabase is configured.",
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
      campaignId?: string | null;
      utm?: Partial<UtmParams>;
    };
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      request.headers.get("Idempotency-Key") ||
      undefined;

    const result = await getIngestionStore().ingestLead({
      orgId,
      channel: "public_capture",
      fullName: body.fullName ?? "Website lead",
      email: body.email,
      phone: body.phone,
      source: body.source ?? "public_capture",
      campaignId: body.campaignId,
      utm: body.utm,
      idempotencyKey: idempotencyKey ?? null,
      payload: body as Record<string, unknown>,
    });

    return jsonOk(
      {
        id: result.leadId,
        status: result.event.status,
        duplicate: result.duplicate,
        campaignId: result.event.campaignId,
        attribution: result.attribution,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
