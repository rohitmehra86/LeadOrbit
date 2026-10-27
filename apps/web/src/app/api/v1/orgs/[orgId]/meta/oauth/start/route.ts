import { randomBytes } from "node:crypto";
import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { buildMetaOAuthStartUrl } from "@leadorbit/domain";
import { saveMetaOAuthPending } from "@/lib/meta/meta-connections";

type Ctx = { params: Promise<{ orgId: string }> };

/** Start Meta OAuth — returns URL for browser redirect. */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const nonce = randomBytes(16).toString("hex");
    const state = `${orgId}.${nonce}`;
    await saveMetaOAuthPending({
      orgId,
      userId: user.id,
      stateNonce: nonce,
    });
    const start = buildMetaOAuthStartUrl({ state });
    if (start.status !== "ready" || !start.url) {
      return jsonOk(
        {
          status: "pending_configuration",
          url: null,
          redirectUri: start.redirectUri,
          configIdPresent: Boolean(start.configId),
          detail: start.detail,
          setupHints: start.setupHints,
        },
        { status: 409 },
      );
    }
    return jsonOk({
      status: "ready",
      url: start.url,
      redirectUri: start.redirectUri,
      configIdPresent: Boolean(start.configId),
      detail: start.detail,
      setupHints: start.setupHints,
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const res = await POST(request, ctx);
  // Allow simple link navigation: if ready, redirect
  if (res.status === 200) {
    const body = (await res.clone().json()) as { url?: string };
    if (body.url) {
      return Response.redirect(body.url, 302);
    }
  }
  return res;
}
