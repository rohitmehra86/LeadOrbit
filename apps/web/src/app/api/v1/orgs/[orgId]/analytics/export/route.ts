import { fromAuthError, requireUser } from "@/lib/api/http";
import { getAnalyticsStore } from "@/lib/tenancy/analytics";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const to = url.searchParams.get("to") ?? new Date().toISOString();
    const from =
      url.searchParams.get("from") ??
      new Date(Date.now() - 30 * 864e5).toISOString();
    const table = url.searchParams.get("table") ?? undefined;
    const { filename, csv } = await getAnalyticsStore().exportCsv(user, orgId, {
      from,
      to,
      table,
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
