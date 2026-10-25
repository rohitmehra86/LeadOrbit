import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import {
  getDomainCampaigns,
  isSupabaseCampaignStore,
} from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string; slug: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, slug } = await ctx.params;
    const store = getDomainCampaigns();
    const item = isSupabaseCampaignStore(store)
      ? await store.getPublishedPageBySlugAsync(orgId, slug)
      : store.getPublishedPageBySlug(orgId, slug);
    if (!item) return jsonProblem(404, "Not Found", "Page not published");
    if (!isSupabaseCampaignStore(store) && "trackEventPublic" in store) {
      store.trackEventPublic({
        orgId,
        campaignId: item.campaignId,
        pageId: item.id,
        eventType: "page_view",
      });
    }
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
