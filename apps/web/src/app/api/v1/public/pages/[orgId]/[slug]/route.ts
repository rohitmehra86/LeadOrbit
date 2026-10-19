import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; slug: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, slug } = await ctx.params;
    const store = getCampaignStore();
    const item = store.getPublishedPageBySlug(orgId, slug);
    if (!item) return jsonProblem(404, "Not Found", "Page not published");
    store.trackEventPublic({
      orgId,
      campaignId: item.campaignId,
      pageId: item.id,
      eventType: "page_view",
    });
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
