import { jsonOk, jsonProblem } from "@/lib/api/http";
import { getWhiteLabelStore } from "@/lib/tenancy/white-label";

type Ctx = { params: Promise<{ orgId: string }> };

/** Public branded login/page surface — no auth. */
export async function GET(_request: Request, ctx: Ctx) {
  const { orgId } = await ctx.params;
  const brand = getWhiteLabelStore().getPublicBrand(orgId);
  if (!brand) {
    return jsonProblem(404, "Branding not configured");
  }
  return jsonOk({
    brand,
    surfaces: {
      login: {
        headline: brand.loginHeadline ?? "Sign in",
        logoUrl: brand.logoUrl,
        primaryColor: brand.primaryColor,
      },
      email: {
        fromName: brand.emailFromName,
        footer: brand.emailFooter,
      },
      hideLeadOrbitBranding: brand.hideLeadOrbitBranding,
    },
  });
}
