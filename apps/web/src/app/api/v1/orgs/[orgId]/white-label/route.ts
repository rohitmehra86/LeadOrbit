import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getWhiteLabelStore } from "@/lib/tenancy/white-label";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getWhiteLabelStore();
    const brand = await store.getBrand(user, orgId);
    const domains = await store.listDomains(user, orgId);
    const visibility = await store.featureVisibility(user, orgId);
    const agencyChildren = await store.listAgencyChildren(user, orgId);
    return jsonOk({ brand, domains, visibility, agencyChildren });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getWhiteLabelStore();
    const body = (await request.json()) as {
      action: "update_brand" | "add_domain" | "link_agency";
      brand?: Parameters<typeof store.updateBrand>[2];
      hostname?: string;
      childOrgId?: string;
      label?: string;
    };

    if (body.action === "update_brand") {
      const brand = await store.updateBrand(user, orgId, body.brand ?? {});
      return jsonOk({ brand });
    }
    if (body.action === "add_domain") {
      if (!body.hostname) {
        return jsonOk({ error: "hostname required" }, { status: 400 });
      }
      const domain = await store.addDomain(user, orgId, body.hostname);
      return jsonOk({ domain });
    }
    if (body.action === "link_agency") {
      if (!body.childOrgId) {
        return jsonOk({ error: "childOrgId required" }, { status: 400 });
      }
      const link = await store.linkAgencyChild(
        user,
        orgId,
        body.childOrgId,
        body.label,
      );
      return jsonOk({ link });
    }
    return jsonOk({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fromAuthError(err);
  }
}
