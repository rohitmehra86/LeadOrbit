import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { CampaignObjective, CampaignStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCampaignStore().listCampaigns(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      objective?: CampaignObjective;
      adCopy?: string;
      templateKey?: string;
      status?: CampaignStatus;
      scheduleStart?: string | null;
      scheduleEnd?: string | null;
      budget?: {
        currency: string;
        dailyCents: number | null;
        totalCents: number | null;
      };
      audience?: { segments: string[]; territories: string[]; notes: string };
      abTestEnabled?: boolean;
      utmSource?: string;
      utmMedium?: string;
    };
    if (!body.name?.trim()) {
      return jsonOk({ error: "name required" }, { status: 400 });
    }
    const item = await getCampaignStore().createCampaign(user, orgId, {
      name: body.name.trim(),
      objective: body.objective,
      adCopy: body.adCopy,
      templateKey: body.templateKey,
      status: body.status,
      scheduleStart: body.scheduleStart,
      scheduleEnd: body.scheduleEnd,
      budget: body.budget,
      audience: body.audience,
      abTestEnabled: body.abTestEnabled,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
