import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import {
  metaOAuthRedirectUri,
  metaOAuthSetupHints,
  metaRuntimeCredentialStatus,
  resolveMetaAdsCredentials,
} from "@leadorbit/domain";
import { getCampaignStore } from "@/lib/tenancy/campaigns";
import {
  getMetaConnectionPublic,
  getMetaConnectionSecrets,
} from "@/lib/meta/meta-connections";

type Ctx = { params: Promise<{ orgId: string }> };

/** Honest Meta credential + org connection status (never exposes secret values). */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const integrations = await getCampaignStore().listAdIntegrations(user, orgId);
    const metaRow = integrations.find((i) => i.network === "meta") ?? null;
    const connection = await getMetaConnectionPublic(user, orgId);
    const secrets = await getMetaConnectionSecrets(user, orgId);
    const runtime = resolveMetaAdsCredentials(
      process.env,
      secrets
        ? {
            accessToken: secrets.accessToken,
            adAccountId: secrets.adAccountId,
            pageId: secrets.pageId,
          }
        : null,
    );
    const creds = metaRuntimeCredentialStatus(runtime);

    let connectionStatus:
      | "connected"
      | "token_expired"
      | "pending_configuration"
      | "not_connected" = "not_connected";
    if (connection?.status === "token_expired") connectionStatus = "token_expired";
    else if (connection?.hasToken) connectionStatus = "connected";
    else if (creds.status === "pending_configuration") {
      connectionStatus = "pending_configuration";
    }

    return jsonOk({
      item: {
        network: "meta" as const,
        credentialStatus: creds.status,
        detail: creds.detail,
        present: creds.present,
        setupHints: metaOAuthSetupHints(),
        source: creds.source,
        oauthRedirectUri: metaOAuthRedirectUri(),
        connection: connection
          ? {
              status: connection.status,
              adAccountId: connection.adAccountId,
              pageId: connection.pageId,
              connectedAt: connection.connectedAt,
              tokenExpiresAt: connection.tokenExpiresAt,
              lastError: connection.lastError,
            }
          : null,
        connectionStatus,
        externalChecklist: [
          {
            label: "Privacy Policy URL on Meta App Basic",
            href: "https://developers.facebook.com/apps/",
          },
          {
            label: "Switch Meta App to Live (when ready)",
            href: "https://developers.facebook.com/apps/",
          },
          {
            label: "Ad Account billing / payment method",
            href: "https://business.facebook.com/billing_hub",
          },
        ],
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
