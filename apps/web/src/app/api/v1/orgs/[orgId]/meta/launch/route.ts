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

/** POST prepare: local Launch Pack + Meta plan (needs later approve). Approve maps HTTP by Meta outcome. */
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
      resumeMeta?: {
        campaign_id?: string | null;
        adset_id?: string | null;
        ad_id?: string | null;
      };
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
          meta_created: false,
          local: {
            campaign_id: draft.local.campaignId,
            page_slug: draft.local.pageSlug,
            public_path: draft.local.publicPath,
            published: draft.local.published,
          },
          message:
            "Local Launch Pack drafted/published. Meta is NOT created yet — Approve required. Incomplete META_ADS_* → pending_configuration (not success).",
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
        resumeMeta: body.resumeMeta,
      });

      const payload = {
        status: result.status,
        meta_created: result.metaCreated,
        detail: result.detail,
        campaign_id: result.campaign_id,
        adset_id: result.adset_id,
        ad_id: result.ad_id,
        meta: {
          campaign_id: result.campaign_id,
          adset_id: result.adset_id,
          ad_id: result.ad_id,
        },
        local: {
          campaign_id: result.localCampaignId,
          status:
            result.status === "created_active"
              ? "active"
              : result.status === "created_paused"
                ? "paused"
                : "draft",
        },
        setupHints: result.setupHints,
        present: result.present,
        item: result,
      };

      if (result.status === "pending_configuration") {
        // Not a successful Meta create — explicit non-2xx so Network ≠ “created”
        return jsonOk(payload, { status: 409 });
      }
      if (result.status === "error") {
        return jsonOk(payload, { status: 502 });
      }
      // created_paused | created_active
      return jsonOk(payload, { status: 201 });
    }

    return jsonProblem(400, "Validation Error", "Unknown action");
  } catch (err) {
    if (err instanceof Error && /approval/i.test(err.message)) {
      return jsonProblem(400, "Validation Error", err.message);
    }
    return fromAuthError(err);
  }
}
