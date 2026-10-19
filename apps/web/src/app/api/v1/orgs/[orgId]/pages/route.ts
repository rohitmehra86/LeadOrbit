import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import type { PageDocument } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getCampaignStore().listPages(user, orgId) });
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
      slug?: string;
      campaignId?: string | null;
      formId?: string | null;
      templateKey?: string | null;
      document?: PageDocument;
    };
    const item = await getCampaignStore().createPage(user, orgId, {
      name: body.name ?? "Untitled page",
      slug: body.slug,
      campaignId: body.campaignId,
      formId: body.formId,
      templateKey: body.templateKey,
      document: body.document,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
