import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";
import { AuthError } from "@leadorbit/db";

/** Platform admin — cross-tenant audit browser (restricted). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limit = Number(
      new URL(request.url).searchParams.get("limit") ?? "100",
    );
    const store = getTenancyStore();
    if (!("listAllAuditAsPlatformAdmin" in store)) {
      throw new AuthError("Platform audit unavailable in this auth mode", "forbidden");
    }
    const items = await store.listAllAuditAsPlatformAdmin(
      user,
      Math.min(Math.max(limit, 1), 500),
    );
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
