import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const items = await getTenancyStore().listFlags(user, orgId);
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as { key?: string; enabled?: boolean };
    const item = await getTenancyStore().setFlag(
      user,
      orgId,
      body.key ?? "",
      Boolean(body.enabled),
    );
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
