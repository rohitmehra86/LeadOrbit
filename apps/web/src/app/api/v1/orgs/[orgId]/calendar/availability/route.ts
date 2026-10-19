import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getCalendarStore } from "@/lib/tenancy/calendar";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") ?? undefined;
    return jsonOk({
      items: await getCalendarStore().listAvailability(user, orgId, userId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      userId?: string;
      windows?: Array<{
        weekday: number;
        startTime: string;
        endTime: string;
        timezone?: string;
      }>;
    };
    const items = await getCalendarStore().setAvailability(user, orgId, {
      userId: body.userId ?? user.id,
      windows: body.windows ?? [],
    });
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
