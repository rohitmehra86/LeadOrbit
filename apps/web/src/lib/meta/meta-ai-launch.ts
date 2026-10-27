import type { SessionUser } from "@leadorbit/db";
import {
  assertMetaLaunchApproved,
  buildMetaLaunchPlan,
  inferMetaResumeAfterPartialFailure,
  metaRuntimeCredentialStatus,
  parseMetaIdsFromAdCopy,
  publishMetaLaunchPlan,
  resolveMetaAdsCredentials,
  type MetaLaunchBrief,
  type MetaLaunchPlan,
  type MetaPublishResult,
} from "@leadorbit/domain";
import { createLaunchPack, publishLaunchPack } from "@/lib/launch/launch-pack";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { getMetaConnectionSecrets } from "@/lib/meta/meta-connections";

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
    credentialStatus: ReturnType<typeof metaRuntimeCredentialStatus>["status"];
    detail: string;
    present: Record<string, boolean>;
    setupHints: string[];
    /** Alias for credentialStatus (compat). */
    status: ReturnType<typeof metaRuntimeCredentialStatus>["status"];
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

  const orgSecrets = await getMetaConnectionSecrets(actor, orgId);
  const wantsInstantForm = Boolean(brief.leadGenFormId?.trim());
  const absoluteLanding = wantsInstantForm
    ? null
    : brief.landingPageUrl?.trim()
      ? brief.landingPageUrl.trim()
      : opts?.appOrigin
        ? `${opts.appOrigin.replace(/\/$/, "")}${publicPath}`
        : publicPath;

  const plan = buildMetaLaunchPlan({
    ...brief,
    landingPageUrl: absoluteLanding,
    leadGenFormId:
      brief.leadGenFormId?.trim() ||
      (wantsInstantForm ? orgSecrets?.leadGenFormId : null) ||
      null,
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

  const runtime = resolveMetaAdsCredentials(
    process.env,
    orgSecrets
      ? {
          accessToken: orgSecrets.accessToken,
          adAccountId: orgSecrets.adAccountId,
          pageId: orgSecrets.pageId,
          pixelId: orgSecrets.pixelId,
          leadGenFormId: orgSecrets.leadGenFormId,
        }
      : null,
  );
  const creds = metaRuntimeCredentialStatus(runtime, process.env);
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
    resumeMeta?: {
      campaign_id?: string | null;
      adset_id?: string | null;
      ad_id?: string | null;
    };
  },
): Promise<MetaPublishResult & { localCampaignId: string }> {
  assertMetaLaunchApproved(input.approved);
  const plan: MetaLaunchPlan = {
    ...input.plan,
    enableSpend: Boolean(input.enableSpend),
  };
  const orgSecrets = await getMetaConnectionSecrets(actor, orgId);
  const localCampaign = await getCampaignStore().getCampaign(
    actor,
    orgId,
    input.campaignId,
  );
  const storedMeta = parseMetaIdsFromAdCopy(localCampaign?.adCopy ?? null);
  const resumeExternal = inferMetaResumeAfterPartialFailure(storedMeta, {
    campaignId: input.resumeMeta?.campaign_id?.trim() || null,
    adSetId: input.resumeMeta?.adset_id?.trim() || null,
    adId: input.resumeMeta?.ad_id?.trim() || null,
  });

  const result = await publishMetaLaunchPlan(plan, process.env, {
    orgCredentials: orgSecrets
      ? {
          accessToken: orgSecrets.accessToken,
          adAccountId: orgSecrets.adAccountId,
          pageId: orgSecrets.pageId,
          pixelId: orgSecrets.pixelId,
          leadGenFormId: orgSecrets.leadGenFormId,
        }
      : null,
    resumeExternal,
  });

  // Refresh Meta integration row honesty (pending if keys incomplete)
  await getCampaignStore().authorizeAdNetwork(actor, orgId, "meta");

  if (result.metaCreated && result.campaign_id) {
    await getCampaignStore().updateCampaign(actor, orgId, input.campaignId, {
      status:
        result.status === "created_active"
          ? "active"
          : result.status === "created_paused"
            ? "paused"
            : "draft",
      adCopy: [
        plan.primaryText,
        "",
        "[Meta Marketing API]",
        `meta_status=${result.status}`,
        `campaign_id=${result.campaign_id}`,
        `adset_id=${result.adset_id ?? ""}`,
        `ad_id=${result.ad_id ?? ""}`,
        result.detail,
      ].join("\n"),
    });
  } else if (result.status === "pending_configuration") {
    await getCampaignStore().updateCampaign(actor, orgId, input.campaignId, {
      status: "draft",
      adCopy: [
        plan.primaryText,
        "",
        "[Meta AI — pending_configuration]",
        "Local Launch Pack only — Meta Marketing API was NOT called.",
        result.detail,
      ].join("\n"),
    });
  } else if (result.status === "error") {
    await getCampaignStore().updateCampaign(actor, orgId, input.campaignId, {
      status: "draft",
      adCopy: [
        plan.primaryText,
        "",
        "[Meta AI — error]",
        `meta_status=error`,
        result.campaign_id ? `campaign_id=${result.campaign_id}` : "campaign_id=",
        result.adset_id ? `adset_id=${result.adset_id}` : "adset_id=",
        result.ad_id ? `ad_id=${result.ad_id}` : "ad_id=",
        result.detail,
      ].join("\n"),
    });
  }

  return { ...result, localCampaignId: input.campaignId };
}
