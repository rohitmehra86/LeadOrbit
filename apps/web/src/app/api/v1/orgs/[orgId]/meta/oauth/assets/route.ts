import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { listMetaOAuthAssets } from "@/lib/meta/meta-assets-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * Legacy path — same handler as `/meta/assets`. Prefer the stable route.
 */
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const result = await listMetaOAuthAssets({
      user,
      orgId,
      nonce: url.searchParams.get("nonce"),
      adAccountId: url.searchParams.get("adAccountId"),
      pageId: url.searchParams.get("pageId"),
    });
    if (!result.ok) {
      return jsonProblem(result.status, result.title, result.detail);
    }
    return jsonOk(result.body);
  } catch (err) {
    return fromAuthError(err);
  }
}
