import { jsonOk, jsonProblem } from "@/lib/api/http";
import { getWhiteLabelStore } from "@/lib/tenancy/white-label";

/** Resolve public brand from custom hostname (domain map scaffold). */
export async function GET(request: Request) {
  const host =
    new URL(request.url).searchParams.get("host") ||
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host");
  if (!host) {
    return jsonProblem(400, "host required");
  }
  const store = getWhiteLabelStore();
  const orgId = store.resolveOrgIdByHostname(host);
  if (!orgId) {
    return jsonProblem(404, "No org mapped for hostname");
  }
  const brand = store.getPublicBrand(orgId);
  if (!brand) {
    return jsonProblem(404, "Branding not configured");
  }
  return jsonOk({
    orgId,
    brand,
    loginPath: `/p/${orgId}/login`,
  });
}
