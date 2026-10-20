import { randomBytes } from "node:crypto";
import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getTenancyStore } from "@/lib/tenancy/service";
import { buildCalendarOAuthStartUrl, type ExternalCalendarProvider } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string; provider: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { orgId, provider: raw } = await ctx.params;
    const user = await requireUser();
    await getTenancyStore().getOrganization(user, orgId);
    if (raw !== "google" && raw !== "microsoft") {
      return jsonOk(
        {
          item: {
            status: "pending_configuration",
            detail: "Unsupported calendar provider",
            url: null,
          },
        },
        { status: 400 },
      );
    }
    const provider = raw as ExternalCalendarProvider;
    const state = randomBytes(16).toString("hex");
    const item = buildCalendarOAuthStartUrl(provider, { orgId, state });
    return jsonOk({ item: { ...item, state } });
  } catch (err) {
    return fromAuthError(err);
  }
}
