import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { MarketingEvent } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      campaignId?: string | null;
      pageId?: string | null;
      formId?: string | null;
      eventType?: MarketingEvent["eventType"];
      meta?: Record<string, unknown>;
    };
    const item = await getCampaignStore().trackEvent(user, orgId, {
      campaignId: body.campaignId,
      pageId: body.pageId,
      formId: body.formId,
      eventType: body.eventType ?? "page_view",
      meta: body.meta,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
