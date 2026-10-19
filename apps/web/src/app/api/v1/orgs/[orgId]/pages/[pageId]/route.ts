import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { PageDocument, PublishStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; pageId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, pageId } = await ctx.params;
    const user = await requireUser();
    const item = await getCampaignStore().getPage(user, orgId, pageId);
    if (!item) return jsonProblem(404, "Not Found", "Page not found");
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, pageId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as Partial<{
      name: string;
      slug: string;
      document: PageDocument;
      campaignId: string | null;
      formId: string | null;
      status: PublishStatus;
    }>;
    const item = await getCampaignStore().updatePage(user, orgId, pageId, body);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
