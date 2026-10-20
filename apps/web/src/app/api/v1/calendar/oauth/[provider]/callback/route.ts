import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ provider: string }> };

/**
 * OAuth callback landing — exchanges are not completed without verified client secrets
 * and stored tokens. Returns an honest HTML notice (never fakes calendar connect success).
 */
export async function GET(request: Request, ctx: Ctx) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:43127").replace(
    /\/$/,
    "",
  );
  const orgId = state?.split(".")[0];
  const back = orgId ? `${appUrl}/app/orgs/${orgId}/calendar` : `${appUrl}/app`;

  let message: string;
  if (error) {
    message = `OAuth error from ${provider}: ${error}. Calendar remains disconnected.`;
  } else if (!code) {
    message = `Missing authorization code for ${provider}. No calendar connection was stored.`;
  } else {
    message = `${provider} returned an auth code, but token exchange + calendar sync are not verified in this environment — connection not claimed. Configure secrets and complete Wave 4 callback wiring.`;
  }

  const html = `<!doctype html><html><body style="font-family:system-ui;padding:2rem;background:#0a0e14;color:#f4efe6">
    <h1>Calendar OAuth</h1>
    <p>${message}</p>
    <p><a href="${back}" style="color:#e8a54b">Back to calendar</a></p>
  </body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
