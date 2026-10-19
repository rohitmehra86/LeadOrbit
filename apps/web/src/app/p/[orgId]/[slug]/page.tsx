import { notFound } from "next/navigation";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import { SafePageRender } from "@/components/marketing/safe-page-render";
import { PublicForm } from "./public-form";

type Props = { params: Promise<{ orgId: string; slug: string }> };

export default async function PublicLandingPage({ params }: Props) {
  const { orgId, slug } = await params;
  const store = getCampaignStore();
  const page = store.getPublishedPageBySlug(orgId, slug);
  if (!page) notFound();

  store.trackEventPublic({
    orgId,
    campaignId: page.campaignId,
    pageId: page.id,
    eventType: "page_view",
  });

  const form = page.formId
    ? store.getPublishedForm(orgId, page.formId)
    : null;

  return (
    <main className="mx-auto min-h-screen px-4 py-12">
      <SafePageRender
        page={page}
        formSlot={
          form ? (
            <PublicForm
              orgId={orgId}
              formId={form.id}
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
