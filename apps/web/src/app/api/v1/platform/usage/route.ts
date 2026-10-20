import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getBillingStore } from "@/lib/tenancy/billing";
import { getTenancyStore } from "@/lib/tenancy/service";

/** Platform admin — cross-tenant usage snapshot (audited via permission gate). */
export async function GET() {
  try {
    const user = await requireUser();
    const usage = await getBillingStore().platformUsageSummary(user);
    // Touch tenancy so platform access is auditable in local store
    await getTenancyStore().listAllOrgsAsPlatformAdmin(user);
    return jsonOk({ items: usage });
  } catch (err) {
    return fromAuthError(err);
  }
}
