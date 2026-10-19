import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getRealEstateStore } from "@/lib/tenancy/real-estate";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getRealEstateStore();
    return jsonOk({
      items: await store.listEnquiries(user, orgId),
      analytics: await store.analytics(user, orgId),
    });
  } catch (err) {
    return fromAuthError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getRealEstateStore();
    const body = (await request.json()) as {
      action?: "create" | "preferences" | "site_visit";
      leadId?: string | null;
      projectId?: string | null;
      unitId?: string | null;
      brokerId?: string | null;
      assigneeUserId?: string | null;
      source?: string;
      message?: string | null;
      preferenceId?: string | null;
      autoMatch?: boolean;
      budgetMin?: number | null;
      budgetMax?: number | null;
      locations?: string[];
      bhkMin?: number | null;
      bhkMax?: number | null;
      mustHaveAmenities?: string[];
      enquiryId?: string;
      appointmentTypeId?: string;
      startsAt?: string;
      siteVisitAddress?: string;
    };

    if (body.action === "preferences") {
      const item = await store.upsertBuyerPreferences(user, orgId, {
        leadId: body.leadId,
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        locations: body.locations,
        bhkMin: body.bhkMin,
        bhkMax: body.bhkMax,
        mustHaveAmenities: body.mustHaveAmenities,
      });
      return jsonOk({ item }, { status: 201 });
    }

    if (body.action === "site_visit") {
      if (!body.enquiryId || !body.appointmentTypeId || !body.startsAt || !body.siteVisitAddress) {
        return jsonOk(
          {
            type: "https://leadorbit.dev/problems/400",
            title: "validation",
            status: 400,
            detail: "enquiryId, appointmentTypeId, startsAt, siteVisitAddress required",
          },
          { status: 400 },
        );
      }
      return jsonOk(
        await store.scheduleSiteVisit(user, orgId, {
          enquiryId: body.enquiryId,
          appointmentTypeId: body.appointmentTypeId,
          startsAt: body.startsAt,
          siteVisitAddress: body.siteVisitAddress,
        }),
      );
    }

    return jsonOk(
      await store.createEnquiry(user, orgId, {
        leadId: body.leadId,
        projectId: body.projectId,
        unitId: body.unitId,
        brokerId: body.brokerId,
        assigneeUserId: body.assigneeUserId,
        source: body.source,
        message: body.message,
        preferenceId: body.preferenceId,
        autoMatch: body.autoMatch ?? true,
      }),
      { status: 201 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
