import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { FormField, PublishStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; formId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId, formId } = await ctx.params;
    const user = await requireUser();
    const item = await getCampaignStore().getForm(user, orgId, formId);
    if (!item) return jsonProblem(404, "Not Found", "Form not found");
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { orgId, formId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as Partial<{
      name: string;
      status: PublishStatus;
      fields: FormField[];
      multiStep: boolean;
      campaignId: string | null;
      consentText: string | null;
      webhookUrl: string | null;
      thankYouMessage: string;
      embedEnabled: boolean;
      spamHoneypotEnabled: boolean;
      duplicateDetection: boolean;
    }>;
    const item = await getCampaignStore().updateForm(user, orgId, formId, body);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
