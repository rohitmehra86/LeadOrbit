import { fromAuthError, requireUser } from "@/lib/api/http";
import { getCrmStore } from "@/lib/tenancy/crm";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const csv = await getCrmStore().exportLeadsCsv(user, orgId);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="leads-${orgId}.csv"`,
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
