import { NextResponse } from "next/server";
import {
  exchangeMetaLongLivedToken,
  exchangeMetaOAuthCode,
  fetchMetaAdAccounts,
  fetchMetaPages,
} from "@leadorbit/domain";
import {
  clearMetaOAuthPending,
  loadMetaOAuthPending,
  updateMetaOAuthPendingToken,
  upsertMetaConnection,
} from "@/lib/meta/meta-connections";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Meta OAuth callback (platform redirect URI).
 * Exchanges code → long-lived token, then auto-saves if one ad account + one page,
 * otherwise redirects to picker.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/$/, "");

  const [orgId, nonce] = state.split(".");
  if (!orgId || !nonce) {
    return NextResponse.redirect(
      `${appUrl}/login?meta_oauth=invalid_state`,
    );
  }

  const fail = (msg: string) =>
    NextResponse.redirect(
      `${appUrl}/app/orgs/${orgId}/settings/meta-connect?error=${encodeURIComponent(msg)}`,
    );

  if (err) return fail(err);
  if (!code) return fail("Missing OAuth code");

  const pending = await loadMetaOAuthPending(nonce);
  if (!pending || pending.orgId !== orgId) {
    return fail("OAuth session expired — start Connect Meta again");
  }

  const user = await getSessionUser();
  if (!user || user.id !== pending.userId) {
    return NextResponse.redirect(
      `${appUrl}/login?next=${encodeURIComponent(`/app/orgs/${orgId}/settings/meta-connect`)}`,
    );
  }

  const short = await exchangeMetaOAuthCode(code);
  if (!short.ok || !short.accessToken) {
    return fail(short.error ?? "Token exchange failed");
  }

  let accessToken = short.accessToken;
  let expiresIn = short.expiresIn;
  const longLived = await exchangeMetaLongLivedToken(short.accessToken);
  if (longLived.ok && longLived.accessToken) {
    accessToken = longLived.accessToken;
    expiresIn = longLived.expiresIn ?? expiresIn;
  }

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  await updateMetaOAuthPendingToken(nonce, accessToken, tokenExpiresAt);

  const [accounts, pages] = await Promise.all([
    fetchMetaAdAccounts(accessToken),
    fetchMetaPages(accessToken),
  ]);

  if (!accounts.ok) return fail(accounts.error ?? "Could not list ad accounts");
  if (!pages.ok) return fail(pages.error ?? "Could not list Pages");

  if (accounts.items.length === 1 && pages.items.length === 1) {
    await upsertMetaConnection(user, orgId, {
      accessToken,
      adAccountId: accounts.items[0]!.id,
      pageId: pages.items[0]!.id,
      tokenExpiresAt,
    });
    await clearMetaOAuthPending(orgId);
    await getCampaignStore().authorizeAdNetwork(user, orgId, "meta");
    return NextResponse.redirect(
      `${appUrl}/app/orgs/${orgId}/settings/meta-connect?connected=1`,
    );
  }

  return NextResponse.redirect(
    `${appUrl}/app/orgs/${orgId}/settings/meta-connect?step=pick&nonce=${encodeURIComponent(nonce)}`,
  );
}
