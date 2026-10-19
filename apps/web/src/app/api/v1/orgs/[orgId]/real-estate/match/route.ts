import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getRealEstateStore } from "@/lib/tenancy/real-estate";

type Ctx = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const body = (await request.json()) as {
      budgetMin?: number | null;
      budgetMax?: number | null;
      locations?: string[];
      bhk?: number | null;
      bhkMin?: number | null;
      bhkMax?: number | null;
      amenities?: string[];
      projectId?: string | null;
      limit?: number;
    };
    const items = await getRealEstateStore().matchInventory(
      user,
      orgId,
      {
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        locations: body.locations,
        bhk: body.bhk,
        bhkMin: body.bhkMin,
        bhkMax: body.bhkMax,
        amenities: body.amenities,
        projectId: body.projectId,
      },
      body.limit ?? 20,
    );
    return jsonOk({ items });
  } catch (err) {
    return fromAuthError(err);
  }
}
