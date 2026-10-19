import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getAiStore } from "@/lib/tenancy/ai";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    return jsonOk({ items: await getAiStore().listEvals(user, orgId) });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      personaId?: string | null;
      input?: Record<string, unknown>;
      expected?: Record<string, unknown>;
      run?: boolean;
      evalId?: string;
    };
    if (body.run && body.evalId) {
      const out = await getAiStore().runEval(user, orgId, body.evalId);
      return jsonOk(out);
    }
    const item = await getAiStore().createEval(user, orgId, {
      name: body.name ?? "Untitled eval",
      personaId: body.personaId,
      input: body.input ?? { text: "" },
      expected: body.expected ?? {},
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
