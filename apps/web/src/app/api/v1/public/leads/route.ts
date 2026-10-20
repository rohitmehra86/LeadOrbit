import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getIngestionStore } from "@/lib/tenancy/ingestion";
import { getAuthMode, AuthError, isSupabaseConfigured } from "@leadorbit/db";
import type { UtmParams } from "@leadorbit/domain";

function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Public capture via ingestion pipeline.
 * Requires X-Org-Id + X-Capture-Token. Idempotency-Key supported.
 * Local: SQLite IngestionStore. Supabase: ingest_public_lead RPC (org token hash).
 */
export async function POST(request: Request) {
  try {
    const orgId = request.headers.get("x-org-id");
    const token = request.headers.get("x-capture-token");
    const expected = process.env.DEV_CAPTURE_TOKEN || "dev-capture";
    if (!orgId || !token) {
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

    if (getAuthMode() === "local") {
      if (token !== expected) {
        throw new AuthError("Invalid capture credentials", "unauthorized");
      }
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
    }

    // AUTH_MODE=supabase — durable RPC path
    if (!isSupabaseConfigured()) {
      return jsonProblem(
        501,
        "Not Implemented",
        "Supabase is not configured for public capture",
      );
    }

    const tokenHash = hashCaptureToken(token);
    const admin = createSupabaseAdminClient();

    // Bootstrap: if token matches DEV_CAPTURE_TOKEN and service role is set, ensure org hash.
    // Direct upsert (service role bypasses RLS) — set_org_capture_token_hash needs a session.
    if (token === expected && admin) {
      const { error: upsertErr } = await admin.from("org_capture_tokens").upsert(
        {
          org_id: orgId,
          token_hash: tokenHash,
          label: "dev-capture",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (upsertErr) throw new AuthError(upsertErr.message, "validation");
    }

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await anon.rpc("ingest_public_lead", {
      p_org_id: orgId,
      p_token_hash: tokenHash,
      p_payload: {
        fullName: body.fullName ?? "Website lead",
        email: body.email ?? null,
        phone: body.phone ?? null,
        ...body,
      },
      p_utm: body.utm ?? {},
      p_campaign_id: body.campaignId ?? null,
      p_idempotency_key: idempotencyKey ?? null,
      p_source: body.source ?? "public_capture",
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid capture") || msg.includes("42501")) {
        throw new AuthError("Invalid capture credentials", "unauthorized");
      }
      throw new AuthError(error.message, "validation");
    }

    const row = data as {
      leadId: string | null;
      eventId: string;
      status: string;
      duplicate: boolean;
      campaignId: string | null;
    };

    return jsonOk(
      {
        id: row.leadId,
        status: row.status,
        duplicate: Boolean(row.duplicate),
        campaignId: row.campaignId,
        attribution: null,
      },
      { status: row.duplicate ? 200 : 201 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
