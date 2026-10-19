import { fromAuthError, jsonOk } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { UtmParams } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; formId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId, formId } = await ctx.params;
    const body = (await request.json()) as {
      payload?: Record<string, unknown>;
      honeypot?: string;
      utm?: Partial<UtmParams>;
      campaignId?: string | null;
    };
    const item = await getCampaignStore().submitFormPublic({
      orgId,
      formId,
      payload: body.payload ?? {},
      honeypot: body.honeypot,
      utm: body.utm,
      campaignId: body.campaignId,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
