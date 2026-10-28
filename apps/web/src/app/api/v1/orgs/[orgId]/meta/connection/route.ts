import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import {
  getMetaConnectionPublic,
  updateMetaConnectionLeadAssets,
} from "@/lib/meta/meta-connections";

type Ctx = { params: Promise<{ orgId: string }> };

/** Update Pixel / Instant Form on an existing org Meta connection. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      pixelId?: string | null;
      leadGenFormId?: string | null;
    };
    if (body.pixelId === undefined && body.leadGenFormId === undefined) {
      return jsonProblem(
        400,
        "Validation Error",
        "pixelId or leadGenFormId required",
      );
    }
    const item = await updateMetaConnectionLeadAssets(user, orgId, {
      pixelId: body.pixelId,
      leadGenFormId: body.leadGenFormId,
    });
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const item = await getMetaConnectionPublic(user, orgId);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
