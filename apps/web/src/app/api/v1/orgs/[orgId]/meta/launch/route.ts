import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import type { MetaLaunchBrief, MetaLaunchPlan } from "@leadorbit/domain";
import {
  approveMetaAiLaunch,
  prepareMetaAiLaunch,
} from "@/lib/meta/meta-ai-launch";

type Ctx = { params: Promise<{ orgId: string }> };

function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

/** POST prepare: collect brief → local Launch Pack + Meta plan (needs later approve). */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      action?: "prepare" | "approve";
      brief?: MetaLaunchBrief;
      plan?: MetaLaunchPlan;
      campaignId?: string;
      approved?: boolean;
      enableSpend?: boolean;
    };

    const action = body.action ?? "prepare";

    if (action === "prepare") {
      const brief = body.brief;
      if (!brief?.businessOrOffer?.trim() || brief.businessOrOffer.trim().length < 4) {
        return jsonProblem(400, "Validation Error", "businessOrOffer is required");
      }
      if (!brief.geo?.trim()) {
        return jsonProblem(400, "Validation Error", "geo is required");
      }
      if (!brief.budgetAmount || brief.budgetAmount <= 0) {
        return jsonProblem(400, "Validation Error", "budgetAmount must be > 0");
      }
      const draft = await prepareMetaAiLaunch(
        user,
        orgId,
        {
          businessOrOffer: brief.businessOrOffer.trim(),
          geo: brief.geo.trim(),
          budgetAmount: Number(brief.budgetAmount),
          budgetType: brief.budgetType === "lifetime" ? "lifetime" : "daily",
          currency: brief.currency?.trim() || "USD",
          objective: "lead_gen",
          landingPageUrl: brief.landingPageUrl ?? null,
          audienceBasics: brief.audienceBasics ?? null,
          creativeText: brief.creativeText ?? null,
          creativeImageUrl: brief.creativeImageUrl ?? null,
          enableSpend: false,
        },
        { publishLanding: true, appOrigin: appOrigin(request) },
      );
      return jsonOk(
        {
          item: draft,
          status: "needs_approval",
          message:
            "Review the Meta plan. Approve to create on Meta (or save draft if credentials missing). Never spends without approval.",
        },
        { status: 201 },
      );
    }

    if (action === "approve") {
      if (!body.plan || !body.campaignId) {
        return jsonProblem(400, "Validation Error", "plan and campaignId required");
      }
      if (body.approved !== true) {
        return jsonProblem(
          400,
          "Validation Error",
          "approved must be true — Meta launch will not run without approval",
        );
      }
      const result = await approveMetaAiLaunch(user, orgId, {
        plan: body.plan,
        campaignId: body.campaignId,
        approved: true,
        enableSpend: Boolean(body.enableSpend),
      });
      return jsonOk({
        item: result,
        status: result.status,
      });
    }

    return jsonProblem(400, "Validation Error", "Unknown action");
  } catch (err) {
    if (err instanceof Error && /approval/i.test(err.message)) {
      return jsonProblem(400, "Validation Error", err.message);
    }
    return fromAuthError(err);
  }
}
