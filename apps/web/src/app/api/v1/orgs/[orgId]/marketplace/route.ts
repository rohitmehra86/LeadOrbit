import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getMarketplaceStore } from "@/lib/tenancy/marketplace";
import { createLaunchPack } from "@/lib/launch/launch-pack";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getMarketplaceStore();
    const catalog = store.listCatalog(true);
    const installs = await store.listInstalls(user, orgId);
    return jsonOk({ catalog, installs });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getMarketplaceStore();
    const body = (await request.json()) as {
      action: "install";
      packId?: string;
      publish?: boolean;
    };
    if (body.action !== "install" || !body.packId) {
      return jsonOk({ error: "action=install and packId required" }, { status: 400 });
    }

    const plan = store.resolveInstallPlan(body.packId);
    const pack = await createLaunchPack(user, orgId, {
      goal: plan.goal,
      location: plan.location,
      offer: plan.offer,
    });

    // Install creates draft assets only — never auto-publishes without explicit publish flag
    // and still never fakes live provider delivery.
    let published = pack.published;
    let pageSlug = pack.pageSlug;
    let publicPath = pack.publicPath;
    if (body.publish) {
      const { publishLaunchPack } = await import("@/lib/launch/launch-pack");
      const pub = await publishLaunchPack(user, orgId, {
        formId: pack.formId,
        pageId: pack.pageId,
        pageSlug: pack.pageSlug,
      });
      published = true;
      pageSlug = pub.pageSlug;
      publicPath = pub.publicPath;
    }

    const detail = published
      ? `Installed ${plan.pack.name} and published capture URL`
      : `Installed ${plan.pack.name} as draft Launch Pack (not published)`;

    const install = await store.recordInstall(user, orgId, {
      packId: plan.pack.id,
      packSlug: plan.pack.slug,
      campaignId: pack.campaignId,
      formId: pack.formId,
      pageId: pack.pageId,
      pageSlug,
      detail,
    });

    return jsonOk({
      install,
      launchPack: { ...pack, pageSlug, publicPath, published },
      industryTemplateId: plan.industryTemplateId,
      pack: plan.pack,
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
