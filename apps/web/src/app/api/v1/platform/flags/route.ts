import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";
import { AuthError } from "@leadorbit/db";

/** Platform admin — list / set feature flags across tenants. */
export async function GET() {
  try {
    const user = await requireUser();
    const store = getTenancyStore();
    if (!("listAllFlagsAsPlatformAdmin" in store)) {
      throw new AuthError("Platform flags unavailable in this auth mode", "forbidden");
    }
    const items = await store.listAllFlagsAsPlatformAdmin(user);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      orgId?: string | null;
      key?: string;
      enabled?: boolean;
    };
    if (!body.key || typeof body.enabled !== "boolean") {
      return jsonOk({ error: "key and enabled required" }, { status: 400 });
    }
    const store = getTenancyStore();
    if (!("platformSetFlag" in store)) {
      throw new AuthError("Platform flags unavailable in this auth mode", "forbidden");
    }
    const flag = await store.platformSetFlag(
      user,
      body.orgId ?? null,
      body.key,
      body.enabled,
    );
    return jsonOk({ flag });
  } catch (err) {
    return fromAuthError(err);
  }
}
