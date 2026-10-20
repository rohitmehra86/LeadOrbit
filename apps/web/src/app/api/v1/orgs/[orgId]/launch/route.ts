import { fromAuthError, jsonOk, jsonProblem, requireUser } from "@/lib/api/http";
import { createLaunchPack, publishLaunchPack } from "@/lib/launch/launch-pack";

type Ctx = { params: Promise<{ orgId: string }> };

/** Direct Launch Pack API (used by onboarding UI and tests). */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      goal?: string;
      location?: string | null;
      offer?: string | null;
      publish?: boolean;
    };
    if (!body.goal?.trim() || body.goal.trim().length < 4) {
      return jsonProblem(400, "Validation Error", "goal is required (4+ characters)");
    }
    const pack = await createLaunchPack(user, orgId, {
      goal: body.goal.trim(),
      location: body.location ?? null,
      offer: body.offer ?? null,
    });
    if (body.publish) {
      const published = await publishLaunchPack(user, orgId, pack);
      return jsonOk({ pack: { ...pack, ...published, goal: pack.goal } }, { status: 201 });
    }
    return jsonOk({ pack }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
