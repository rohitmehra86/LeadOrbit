import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";

/** Super-admin SaaS portal: list all tenants (audited via permission gate). */
export async function GET() {
  try {
    const user = await requireUser();
    const items = await getTenancyStore().listAllOrgsAsPlatformAdmin(user);
    return jsonOk({
      items: items.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        orgType: o.orgType,
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
