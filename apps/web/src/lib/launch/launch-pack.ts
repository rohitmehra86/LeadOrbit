import type { SessionUser } from "@leadorbit/db";
import { getDomainCampaigns } from "@/lib/tenancy/campaigns";

export type LaunchPack = {
  campaignId: string;
  formId: string;
  pageId: string;
  pageSlug: string;
  publicPath: string;
  published: boolean;
  name: string;
  goal: string;
};

function packNameFromGoal(goal: string): string {
  const trimmed = goal.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
}

function slugFromGoal(goal: string): string {
  const base = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `launch-${Date.now().toString(36)}`;
}

export async function createLaunchPack(
  actor: SessionUser,
  orgId: string,
  input: { goal: string; location?: string | null; offer?: string | null },
): Promise<LaunchPack> {
  const campaigns = getDomainCampaigns();
  const name = packNameFromGoal(input.goal);
  const location = input.location?.trim() || null;
  const offer = input.offer?.trim() || null;

  const adCopy = [
    name,
    location ? `Serving ${location}.` : null,
    offer ? offer : "Talk to our team — share your budget and timeline.",
  ]
    .filter(Boolean)
    .join(" ");

  const campaign = await campaigns.createCampaign(actor, orgId, {
    name,
    objective: "lead_gen",
    adCopy,
    status: "draft",
    utmSource: "leadorbit",
    utmMedium: "launch_pack",
    audience: {
      segments: location ? [location] : [],
      territories: location ? [location] : [],
      notes: input.goal,
    },
  });

  const form = await campaigns.createForm(actor, orgId, {
    name: `${name} — Capture`,
    campaignId: campaign.id,
    templateKey: "lead_gen",
    consentText: "I agree to be contacted about this offer.",
  });

  const page = await campaigns.createPage(actor, orgId, {
    name,
    slug: slugFromGoal(input.goal),
    campaignId: campaign.id,
    formId: form.id,
    document: {
      version: 1,
      seo: {
        title: name,
        description: input.goal.slice(0, 160),
        ogImage: null,
      },
      consentNotice: "By continuing you agree to our privacy notice.",
      blocks: [
        {
          id: "hero",
          type: "hero",
          props: {
            headline: name,
            subheadline: location
              ? `Local opportunities in ${location}. Tell us your budget and timeline.`
              : "Tell us your budget, location, and timeline — we will follow up fast.",
            ctaLabel: "Get details",
          },
        },
        {
          id: "form",
          type: "form",
          props: { heading: "Share your details" },
        },
      ],
    },
  });

  await campaigns.updateCampaign(actor, orgId, campaign.id, {
    formId: form.id,
    landingPageId: page.id,
  });

  return {
    campaignId: campaign.id,
    formId: form.id,
    pageId: page.id,
    pageSlug: page.slug,
    publicPath: `/p/${orgId}/${page.slug}`,
    published: false,
    name,
    goal: input.goal,
  };
}

export async function publishLaunchPack(
  actor: SessionUser,
  orgId: string,
  pack: { formId: string; pageId: string; pageSlug: string },
): Promise<LaunchPack & { published: true }> {
  const campaigns = getDomainCampaigns();
  await campaigns.updateForm(actor, orgId, pack.formId, { status: "published" });
  const page = await campaigns.publishPage(actor, orgId, pack.pageId);
  const form = await campaigns.getForm(actor, orgId, pack.formId);
  const campaignId = form?.campaignId ?? "";
  if (campaignId) {
    await campaigns.updateCampaign(actor, orgId, campaignId, { status: "active" });
  }
  return {
    campaignId,
    formId: pack.formId,
    pageId: pack.pageId,
    pageSlug: page.slug,
    publicPath: `/p/${orgId}/${page.slug}`,
    published: true,
    name: page.name,
    goal: "",
  };
}
