import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getRealEstateStore } from "@/lib/tenancy/real-estate";
import type { InventoryStatus } from "@leadorbit/domain";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { orgId } = await ctx.params;
    const user = await requireUser();
    const store = getRealEstateStore();
    return jsonOk({
      developers: await store.listDevelopers(user, orgId),
      projects: await store.listProjects(user, orgId),
      units: await store.listUnits(user, orgId),
      brokers: await store.listBrokers(user, orgId),
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
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "developer") {
      return jsonOk(
        {
          item: await store.createDeveloper(user, orgId, {
            name: String(body.name ?? "Developer"),
            website: (body.website as string) ?? null,
            contactEmail: (body.contactEmail as string) ?? null,
          }),
        },
        { status: 201 },
      );
    }
    if (action === "project") {
      return jsonOk(
        {
          item: await store.createProject(user, orgId, {
            developerId: String(body.developerId),
            name: String(body.name),
            location: String(body.location),
            city: String(body.city),
            brochurePath: (body.brochurePath as string) ?? null,
            amenities: (body.amenities as string[]) ?? [],
          }),
        },
        { status: 201 },
      );
    }
    if (action === "property") {
      return jsonOk(
        {
          item: await store.createProperty(user, orgId, {
            projectId: String(body.projectId),
            name: String(body.name),
            propertyType: String(body.propertyType ?? "apartment"),
            address: (body.address as string) ?? null,
          }),
        },
        { status: 201 },
      );
    }
    if (action === "tower") {
      return jsonOk(
        {
          item: await store.createTower(user, orgId, {
            propertyId: String(body.propertyId),
            name: String(body.name),
            floors: Number(body.floors ?? 0),
          }),
        },
        { status: 201 },
      );
    }
    if (action === "floor_plan") {
      return jsonOk(
        {
          item: await store.createFloorPlan(user, orgId, {
            projectId: String(body.projectId),
            name: String(body.name),
            bhk: Number(body.bhk),
            carpetSqft: body.carpetSqft == null ? null : Number(body.carpetSqft),
          }),
        },
        { status: 201 },
      );
    }
    if (action === "unit") {
      return jsonOk(
        {
          item: await store.createUnit(user, orgId, {
            projectId: String(body.projectId),
            propertyId: String(body.propertyId),
            towerId: (body.towerId as string) ?? null,
            floorPlanId: (body.floorPlanId as string) ?? null,
            unitNumber: String(body.unitNumber),
            floor: body.floor == null ? null : Number(body.floor),
            bhk: Number(body.bhk),
            price: body.price == null || body.price === "" ? null : Number(body.price),
            status: (body.status as InventoryStatus) ?? "available",
            amenities: (body.amenities as string[]) ?? [],
          }),
        },
        { status: 201 },
      );
    }
    if (action === "broker") {
      return jsonOk(
        {
          item: await store.createBroker(user, orgId, {
            name: String(body.name),
            email: (body.email as string) ?? null,
            phone: (body.phone as string) ?? null,
            firm: (body.firm as string) ?? null,
            channelPartner: Boolean(body.channelPartner),
          }),
        },
        { status: 201 },
      );
    }
    if (action === "unit_status") {
      return jsonOk({
        item: await store.updateUnitStatus(
          user,
          orgId,
          String(body.unitId),
          body.status as InventoryStatus,
        ),
      });
    }

    return jsonOk(
      {
        type: "https://leadorbit.dev/problems/400",
        title: "validation",
        status: 400,
        detail: "Unknown action",
      },
      { status: 400 },
    );
  } catch (err) {
    return fromAuthError(err);
  }
}
