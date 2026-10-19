import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { FormField } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCampaignStore().listForms(user, orgId) });
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
      campaignId?: string | null;
      templateKey?: string | null;
      fields?: FormField[];
      multiStep?: boolean;
      consentText?: string | null;
    };
    const item = await getCampaignStore().createForm(user, orgId, {
      name: body.name ?? "Untitled form",
      campaignId: body.campaignId,
      templateKey: body.templateKey ?? "lead_gen",
      fields: body.fields,
      multiStep: body.multiStep,
      consentText: body.consentText,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
