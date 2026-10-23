import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { fetchMetaAdAccounts, fetchMetaPages } from "@leadorbit/domain";
import { loadMetaOAuthPending } from "@/lib/meta/meta-connections";

type Ctx = { params: Promise<{ orgId: string }> };

/** List ad accounts + pages using pending OAuth token (picker step). */
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const nonce = new URL(request.url).searchParams.get("nonce");
    if (!nonce) {
      return jsonProblem(400, "Validation Error", "nonce is required");
    }
    const pending = await loadMetaOAuthPending(nonce);
    if (!pending || pending.orgId !== orgId || pending.userId !== user.id) {
      return jsonProblem(400, "Validation Error", "OAuth session expired");
    }
    if (!pending.accessToken) {
      return jsonProblem(400, "Validation Error", "OAuth token not ready");
    }
    const [accounts, pages] = await Promise.all([
      fetchMetaAdAccounts(pending.accessToken),
      fetchMetaPages(pending.accessToken),
    ]);
    if (!accounts.ok) {
      return jsonProblem(502, "Meta API Error", accounts.error);
    }
    if (!pages.ok) {
      return jsonProblem(502, "Meta API Error", pages.error);
    }
    return jsonOk({
      adAccounts: accounts.items,
      pages: pages.items,
      tokenExpiresAt: pending.tokenExpiresAt,
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
