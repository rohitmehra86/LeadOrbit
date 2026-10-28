import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import {
  fetchMetaAdAccountPixels,
  fetchMetaAdAccounts,
  fetchMetaPageLeadForms,
  fetchMetaPages,
  resolveMetaPageAccessToken,
} from "@leadorbit/domain";
import {
  getMetaConnectionSecrets,
  loadMetaOAuthPending,
} from "@/lib/meta/meta-connections";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * List ad accounts + pages using pending OAuth token (picker step),
 * or connected-token assets when nonce is omitted.
 * Optional adAccountId / pageId load related pixels and Instant Forms.
 */
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const nonce = url.searchParams.get("nonce");
    const adAccountId = url.searchParams.get("adAccountId");
    const pageId = url.searchParams.get("pageId");

    let accessToken: string | null = null;
    if (nonce) {
      const pending = await loadMetaOAuthPending(nonce);
      if (!pending || pending.orgId !== orgId || pending.userId !== user.id) {
        return jsonProblem(400, "Validation Error", "OAuth session expired");
      }
      accessToken = pending.accessToken;
    } else {
      const secrets = await getMetaConnectionSecrets(user, orgId);
      accessToken = secrets?.accessToken ?? null;
    }
    if (!accessToken) {
      return jsonProblem(400, "Validation Error", "OAuth token not ready");
    }

    // Related assets only (after account/page selection).
    if (adAccountId || pageId) {
      let formToken = accessToken;
      let pageTokenError: string | null = null;
      if (pageId) {
        const pageTok = await resolveMetaPageAccessToken(accessToken, pageId);
        if (pageTok.ok && pageTok.pageAccessToken) {
          formToken = pageTok.pageAccessToken;
        } else {
          pageTokenError = pageTok.error ?? "Page access token unavailable";
        }
      }

      const [pixels, forms] = await Promise.all([
        adAccountId
          ? fetchMetaAdAccountPixels(accessToken, adAccountId)
          : Promise.resolve({
              ok: true as const,
              items: [] as Array<{ id: string; name: string }>,
            }),
        pageId
          ? fetchMetaPageLeadForms(formToken, pageId)
          : Promise.resolve({
              ok: true as const,
              items: [] as Array<{ id: string; name: string; status?: string }>,
            }),
      ]);

      const pixelError = pixels.ok
        ? pixels.items.length === 0
          ? (pixels as { error?: string }).error ?? null
          : null
        : pixels.error ?? "Pixel list failed";
      const leadFormError = !pageId
        ? null
        : pageTokenError && !(forms.ok && forms.items.length > 0)
          ? pageTokenError
          : forms.ok
            ? forms.items.length === 0
              ? (forms as { error?: string }).error ?? null
              : null
            : forms.error ?? "Lead form list failed";

      return jsonOk({
        pixels: pixels.ok ? pixels.items : [],
        leadForms: forms.ok ? forms.items : [],
        pixelError,
        leadFormError,
      });
    }

    const [accounts, pages] = await Promise.all([
      fetchMetaAdAccounts(accessToken),
      fetchMetaPages(accessToken),
    ]);
    if (!accounts.ok) {
      return jsonProblem(502, "Meta API Error", accounts.error);
    }
    if (!pages.ok) {
      return jsonProblem(502, "Meta API Error", pages.error);
    }
    return jsonOk({
      adAccounts: accounts.items.map(({ id, name }) => ({ id, name })),
      pages: pages.items.map(({ id, name }) => ({ id, name })),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
