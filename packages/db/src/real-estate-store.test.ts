import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { CalendarStore } from "./calendar-store";
import { SqliteJobQueue } from "./job-queue";
import { RealEstateStore } from "./real-estate-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-re-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const cal = new CalendarStore(tenancy, db, queue);
  const re = new RealEstateStore(tenancy, db, cal);
  return { tenancy, re, cal };
}

async function seedInventory(
  re: RealEstateStore,
  owner: Awaited<ReturnType<LocalTenancyStore["signUp"]>>,
  orgId: string,
) {
  await re.setModuleEnabled(owner, orgId, true);
  const dev = await re.createDeveloper(owner, orgId, { name: "Skyline Devs" });
  const project = await re.createProject(owner, orgId, {
    developerId: dev.id,
    name: "Horizon Towers",
    location: "Andheri West",
    city: "Mumbai",
    amenities: ["pool", "gym"],
    brochurePath: "/brochures/horizon.pdf",
  });
  const property = await re.createProperty(owner, orgId, {
    projectId: project.id,
    name: "Tower A Wing",
    propertyType: "apartment",
  });
  const tower = await re.createTower(owner, orgId, {
    propertyId: property.id,
    name: "A",
    floors: 20,
  });
  const plan = await re.createFloorPlan(owner, orgId, {
    projectId: project.id,
    name: "3BHK Classic",
    bhk: 3,
    carpetSqft: 1100,
  });
  const u1 = await re.createUnit(owner, orgId, {
    projectId: project.id,
    propertyId: property.id,
    towerId: tower.id,
    floorPlanId: plan.id,
    unitNumber: "A-1203",
    floor: 12,
    bhk: 3,
    price: 2_500_000,
    amenities: ["gym", "pool"],
  });
  const u2 = await re.createUnit(owner, orgId, {
    projectId: project.id,
    propertyId: property.id,
    towerId: tower.id,
    unitNumber: "A-0501",
    floor: 5,
    bhk: 2,
    price: 1_800_000,
    amenities: ["gym"],
  });
  await re.createUnit(owner, orgId, {
    projectId: project.id,
    propertyId: property.id,
    unitNumber: "A-0808",
    bhk: 3,
    price: 2_400_000,
    status: "sold",
  });
  return { project, u1, u2 };
}

test("module disabled blocks inventory ops", async () => {
  const { tenancy, re } = setup();
  const owner = await tenancy.signUp({
    email: "re1@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "RE Co" });
  await assert.rejects(
    () => re.createDeveloper(owner, org.id, { name: "X" }),
    (err: unknown) => err instanceof AuthError && err.code === "validation",
  );
});

test("inventory matching budget location BHK + tenant isolation", async () => {
  const { tenancy, re } = setup();
  const alice = await tenancy.signUp({
    email: "alice-re@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "bob-re@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, { name: "Org A RE" });
  const orgB = await tenancy.createOrganization(bob, { name: "Org B RE" });
  await seedInventory(re, alice, orgA.id);
  await re.setModuleEnabled(bob, orgB.id, true);

  const matches = await re.matchInventory(alice, orgA.id, {
    budgetMax: 3_000_000,
    locations: ["mumbai"],
    bhk: 3,
    amenities: ["gym"],
  });
  assert.ok(matches.length >= 1);
  assert.ok(matches.every((m) => m.unit.orgId === orgA.id));
  assert.ok(matches.every((m) => m.unit.bhk === 3));
  assert.ok(matches.every((m) => m.unit.status === "available"));
  assert.ok(matches[0]!.unit.price != null);

  // Sold excluded; 2BHK excluded by bhk filter
  assert.ok(!matches.some((m) => m.unit.unitNumber === "A-0808"));
  assert.ok(!matches.some((m) => m.unit.bhk === 2));

  await assert.rejects(
    () => re.listUnits(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );

  // Bob's empty org matching returns nothing (no cross-tenant leakage)
  const bobMatches = await re.matchInventory(bob, orgB.id, {
    locations: ["mumbai"],
    bhk: 3,
  });
  assert.equal(bobMatches.length, 0);
});

test("enquiry auto-match + site visit via calendar", async () => {
  const { tenancy, re, cal } = setup();
  const owner = await tenancy.signUp({
    email: "re3@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "RE Co 3" });
  await seedInventory(re, owner, org.id);
  const broker = await re.createBroker(owner, org.id, {
    name: "Partner Realty",
    channelPartner: true,
  });
  const prefs = await re.upsertBuyerPreferences(owner, org.id, {
    budgetMax: 3_000_000,
    locations: ["Andheri"],
    bhkMin: 3,
    bhkMax: 3,
    mustHaveAmenities: ["gym"],
  });
  const { enquiry, matches } = await re.createEnquiry(owner, org.id, {
    brokerId: broker.id,
    preferenceId: prefs.id,
    autoMatch: true,
    message: "Looking for 3BHK",
  });
  assert.equal(enquiry.status, "matched");
  assert.ok(matches.length >= 1);
  assert.equal(enquiry.assigneeUserId, owner.id);

  const type = await cal.createAppointmentType(owner, org.id, {
    name: "Site visit",
    kind: "site_visit",
    requiresSiteVisit: true,
    durationMinutes: 60,
  });
  const visit = await re.scheduleSiteVisit(owner, org.id, {
    enquiryId: enquiry.id,
    appointmentTypeId: type.id,
    startsAt: "2026-11-01T10:00:00.000Z",
    siteVisitAddress: "Horizon Towers, Andheri West",
  });
  assert.equal(visit.enquiry.status, "site_visit");
  assert.ok(visit.appointmentId);

  const analytics = await re.analytics(owner, org.id);
  assert.equal(analytics.totalEnquiries, 1);
  assert.equal(analytics.withBroker, 1);
  assert.equal(analytics.siteVisits, 1);
});

test("AI unit lookup returns authoritative prices only when enabled", async () => {
  const { tenancy, re } = setup();
  const owner = await tenancy.signUp({
    email: "re4@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "RE Co 4" });
  assert.equal(re.lookupUnitsForAi(org.id, "mumbai 3bhk").length, 0);
  await seedInventory(re, owner, org.id);
  const facts = re.lookupUnitsForAi(org.id, "mumbai 3bhk horizon");
  assert.ok(facts.length >= 1);
  assert.ok(facts.some((f) => f.price === 2_500_000));
});
