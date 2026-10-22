import type { SessionUser } from "@leadorbit/db";
import {
  assertMetaLaunchApproved,
  buildMetaLaunchPlan,
  metaAdsCredentialStatus,
  publishMetaLaunchPlan,
  type MetaLaunchBrief,
  type MetaLaunchPlan,
  type MetaPublishResult,
} from "@leadorbit/domain";
import { createLaunchPack, publishLaunchPack } from "@/lib/launch/launch-pack";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

export type MetaAiLaunchDraft = {
  plan: MetaLaunchPlan;
  local: {
    campaignId: string;
    formId: string;
    pageId: string;
    pageSlug: string;
    publicPath: string;
    published: boolean;
  };
  metaStatus: {
    credentialStatus: ReturnType<typeof metaAdsCredentialStatus>["status"];
    detail: string;
    present: Record<string, boolean>;
    setupHints: string[];
    /** Alias for credentialStatus (compat). */
    status: ReturnType<typeof metaAdsCredentialStatus>["status"];
  };
};

export async function prepareMetaAiLaunch(
  actor: SessionUser,
  orgId: string,
  brief: MetaLaunchBrief,
  opts?: { publishLanding?: boolean; appOrigin?: string },
): Promise<MetaAiLaunchDraft> {
  const pack = await createLaunchPack(actor, orgId, {
    goal: brief.businessOrOffer,
    location: brief.geo,
    offer: brief.creativeText ?? null,
  });

  let published = false;
  let pageSlug = pack.pageSlug;
  let publicPath = pack.publicPath;
  if (opts?.publishLanding !== false) {
    const live = await publishLaunchPack(actor, orgId, pack);
    published = true;
    pageSlug = live.pageSlug;
    publicPath = live.publicPath;
  }

  const absoluteLanding = brief.landingPageUrl?.trim()
    ? brief.landingPageUrl.trim()
    : opts?.appOrigin
      ? `${opts.appOrigin.replace(/\/$/, "")}${publicPath}`
      : publicPath;

  const plan = buildMetaLaunchPlan({
    ...brief,
    landingPageUrl: absoluteLanding,
  });

  // Persist plan snapshot on campaign via update adCopy note (lightweight)
  await getCampaignStore().updateCampaign(actor, orgId, pack.campaignId, {
    adCopy: [
      plan.primaryText,
      "",
      `[Meta AI plan ${plan.id}]`,
      `Geo: ${plan.geo}`,
      `Budget: ${plan.budgetType} ${plan.currency} ${plan.budgetAmount}`,
      `Audience: ${plan.audienceSummary}`,
    ].join("\n"),
  });

  const creds = metaAdsCredentialStatus();
  return {
    plan,
    local: {
      campaignId: pack.campaignId,
      formId: pack.formId,
      pageId: pack.pageId,
      pageSlug,
      publicPath,
      published,
    },
    metaStatus: {
      credentialStatus: creds.status,
      detail: creds.detail,
      present: creds.present,
      setupHints: creds.setupHints,
      status: creds.status,
    },
  };
}

export async function approveMetaAiLaunch(
  actor: SessionUser,
  orgId: string,
  input: {
    plan: MetaLaunchPlan;
    campaignId: string;
    approved: boolean;
    enableSpend?: boolean;
  },
): Promise<MetaPublishResult & { localCampaignId: string }> {
  assertMetaLaunchApproved(input.approved);
  const plan: MetaLaunchPlan = {
    ...input.plan,
    enableSpend: Boolean(input.enableSpend),
  };
  const result = await publishMetaLaunchPlan(plan);

  // Refresh Meta integration row honesty
  await getCampaignStore().authorizeAdNetwork(actor, orgId, "meta");

  if (result.external?.campaignId) {
    await getCampaignStore().updateCampaign(actor, orgId, input.campaignId, {
      status: plan.enableSpend ? "active" : "paused",
      adCopy: [
        plan.primaryText,
        "",
        `[Meta external campaign ${result.external.campaignId}]`,
        result.detail,
      ].join("\n"),
    });
  } else if (result.status === "pending_configuration") {
    await getCampaignStore().updateCampaign(actor, orgId, input.campaignId, {
      status: "draft",
    });
  }

  return { ...result, localCampaignId: input.campaignId };
}
