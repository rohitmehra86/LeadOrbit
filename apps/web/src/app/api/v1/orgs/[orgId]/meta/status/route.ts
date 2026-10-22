import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { metaAdsCredentialStatus } from "@leadorbit/domain";
import { getCampaignStore } from "@/lib/tenancy/campaigns";

type Ctx = { params: Promise<{ orgId: string }> };

/** Honest Meta credential + integration status (never exposes secret values). */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const integrations = await getCampaignStore().listAdIntegrations(user, orgId);
    const metaRow = integrations.find((i) => i.network === "meta") ?? null;
    const creds = metaAdsCredentialStatus();
    return jsonOk({
      item: {
        network: "meta" as const,
        credentialStatus: creds.status,
        detail: creds.detail,
        present: creds.present,
        setupHints: creds.setupHints,
        integration: metaRow
          ? {
              status: metaRow.status,
              lastError: metaRow.lastError,
              externalAccountId: metaRow.externalAccountId,
            }
          : null,
      },
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
