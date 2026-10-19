import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getAnalyticsStore } from "@/lib/tenancy/analytics";

type Ctx = { params: Promise<{ orgId: string }> };

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 864e5);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const defaults = defaultRange();
    const from = url.searchParams.get("from") ?? defaults.from;
    const to = url.searchParams.get("to") ?? defaults.to;
    const compareFrom = url.searchParams.get("compareFrom");
    const compareTo = url.searchParams.get("compareTo");
    const dash = await getAnalyticsStore().dashboard(user, orgId, {
      from,
      to,
      compareFrom,
      compareTo,
    });
    const reports = await getAnalyticsStore().listScheduledReports(user, orgId);
    return jsonOk({ dashboard: dash, scheduledReports: reports });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      action: "schedule";
      name: string;
      cadence: "daily" | "weekly" | "monthly";
      recipients: string[];
    };
    if (body.action === "schedule") {
      const report = await getAnalyticsStore().scheduleReport(user, orgId, {
        name: body.name,
        cadence: body.cadence,
        recipients: body.recipients ?? [],
      });
      return jsonOk({ report });
    }
    return jsonOk({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fromAuthError(err);
  }
}
