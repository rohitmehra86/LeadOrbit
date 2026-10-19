import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getIngestionStore } from "@/lib/tenancy/ingestion";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      network?: "meta_lead_ads" | "google_lead_ads";
      action?: "authorize" | "pull";
    };
    const network = body.network ?? "meta_lead_ads";
    const store = getIngestionStore();
    if (body.action === "pull") {
      return jsonOk({ item: await store.pullLeadAds(user, orgId, network) });
    }
    const item = await store.authorizeLeadAds(user, orgId, network);
    return jsonOk({ item });
  } catch (err) {
    return fromAuthError(err);
  }
}
