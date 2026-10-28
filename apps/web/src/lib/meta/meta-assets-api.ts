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
import type { SessionUser } from "@leadorbit/db";

/**
 * Shared Meta asset listing for Connect Meta (ad accounts, pages, pixels, forms).
 * Used by stable `/meta/assets` and legacy `/meta/oauth/assets` routes.
 */
export async function listMetaOAuthAssets(input: {
  user: SessionUser;
  orgId: string;
  nonce: string | null;
  adAccountId: string | null;
  pageId: string | null;
}): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; title: string; detail: string }
> {
  const { user, orgId, nonce, adAccountId, pageId } = input;

  let accessToken: string | null = null;
  if (nonce) {
    const pending = await loadMetaOAuthPending(nonce);
    if (!pending || pending.orgId !== orgId || pending.userId !== user.id) {
      return {
        ok: false,
        status: 400,
        title: "Validation Error",
        detail: "OAuth session expired",
      };
    }
    accessToken = pending.accessToken;
  } else {
    const secrets = await getMetaConnectionSecrets(user, orgId);
    accessToken = secrets?.accessToken ?? null;
  }
  if (!accessToken) {
    return {
      ok: false,
      status: 400,
      title: "Validation Error",
      detail: "OAuth token not ready — reconnect Connect Meta",
    };
  }

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

    return {
      ok: true,
      body: {
        pixels: pixels.ok ? pixels.items : [],
        leadForms: forms.ok ? forms.items : [],
        pixelError,
        leadFormError,
      },
    };
  }

  const [accounts, pages] = await Promise.all([
    fetchMetaAdAccounts(accessToken),
    fetchMetaPages(accessToken),
  ]);
  if (!accounts.ok) {
    return {
      ok: false,
      status: 502,
      title: "Meta API Error",
      detail: accounts.error ?? "Ad accounts failed",
    };
  }
  if (!pages.ok) {
    return {
      ok: false,
      status: 502,
      title: "Meta API Error",
      detail: pages.error ?? "Pages failed",
    };
  }
  return {
    ok: true,
    body: {
      adAccounts: accounts.items.map(({ id, name }) => ({ id, name })),
      pages: pages.items.map(({ id, name }) => ({ id, name })),
    },
  };
}
