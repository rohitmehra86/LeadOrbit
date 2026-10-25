import { notFound } from "next/navigation";
import {
  getDomainCampaigns,
  isSupabaseCampaignStore,
} from "@/lib/tenancy/campaigns";
import { SafePageRender } from "@/components/marketing/safe-page-render";
import { PublicForm } from "./public-form";

type Props = { params: Promise<{ orgId: string; slug: string }> };

function unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">
        This page is temporarily unavailable
      </h1>
      <p className="mt-3 text-sm text-[var(--lo-fg-muted)]">
        The listing could not be loaded. Refresh in a moment, or open the link
        from the ad again.
      </p>
    </main>
  );
}

export default async function PublicLandingPage({ params }: Props) {
  const { orgId, slug } = await params;
  const store = getDomainCampaigns();
  let page;
  try {
    page = isSupabaseCampaignStore(store)
      ? await store.getPublishedPageBySlugAsync(orgId, slug)
      : store.getPublishedPageBySlug(orgId, slug);
  } catch (error) {
    console.error(
      "public_landing_load_failed",
      error instanceof Error ? error.message : "unknown",
    );
    return unavailable();
  }
  if (!page) notFound();

  if (!isSupabaseCampaignStore(store) && "trackEventPublic" in store) {
    store.trackEventPublic({
      orgId,
      campaignId: page.campaignId,
      pageId: page.id,
      eventType: "page_view",
    });
  }

  let form = null;
  try {
    form = page.formId
      ? isSupabaseCampaignStore(store)
        ? await store.getPublishedFormAsync(orgId, page.formId)
        : store.getPublishedForm(orgId, page.formId)
      : null;
  } catch (error) {
    console.error(
      "public_form_load_failed",
      error instanceof Error ? error.message : "unknown",
    );
    form = null;
  }

  return (
    <main className="mx-auto min-h-screen px-4 py-12">
      <SafePageRender
        page={page}
        formSlot={
          form ? (
            <PublicForm
              orgId={orgId}
              formId={form.id}
              pageId={page.id}
              campaignId={page.campaignId}
              thankYou={form.thankYouMessage}
              fields={form.fields}
              multiStep={form.multiStep}
            />
          ) : null
        }
      />
    </main>
  );
}
