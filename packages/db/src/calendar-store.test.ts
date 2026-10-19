import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";
import { CalendarStore } from "./calendar-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-cal-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const cal = new CalendarStore(tenancy, db, queue);
  return { tenancy, cal, db };
}

test("transactional double-booking prevention for same assignee", async () => {
  const { tenancy, cal } = setup();
  const owner = await tenancy.signUp({
    email: "owner-cal@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Cal Co" });
  const type = await cal.createAppointmentType(owner, org.id, {
    name: "Demo",
    durationMinutes: 30,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
  });

  const startsAt = "2026-10-20T15:00:00.000Z";
  const first = await cal.bookAppointment(owner, org.id, {
    appointmentTypeId: type.id,
    assigneeUserId: owner.id,
    startsAt,
    title: "First",
  });
  assert.equal(first.status, "scheduled");

  await assert.rejects(
    () =>
      cal.bookAppointment(owner, org.id, {
        appointmentTypeId: type.id,
        assigneeUserId: owner.id,
        startsAt: "2026-10-20T15:20:00.000Z", // overlaps with buffers
        title: "Conflict",
      }),
    (err: unknown) => err instanceof AuthError && err.code === "conflict",
  );

  // Non-overlapping after buffer should succeed
  const later = await cal.bookAppointment(owner, org.id, {
    appointmentTypeId: type.id,
    assigneeUserId: owner.id,
    startsAt: "2026-10-20T16:00:00.000Z",
    title: "Later",
  });
  assert.equal(later.status, "scheduled");
});

test("reschedule conflict and cancel frees slot", async () => {
  const { tenancy, cal } = setup();
  const owner = await tenancy.signUp({
    email: "owner-cal2@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Cal Co 2" });
  const type = await cal.createAppointmentType(owner, org.id, {
    name: "Consult",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  });
  const a = await cal.bookAppointment(owner, org.id, {
    appointmentTypeId: type.id,
    assigneeUserId: owner.id,
    startsAt: "2026-10-21T10:00:00.000Z",
  });
  const b = await cal.bookAppointment(owner, org.id, {
    appointmentTypeId: type.id,
    assigneeUserId: owner.id,
    startsAt: "2026-10-21T11:00:00.000Z",
  });

  await assert.rejects(
    () => cal.rescheduleAppointment(owner, org.id, a.id, b.startsAt),
    (err: unknown) => err instanceof AuthError && err.code === "conflict",
  );

  await cal.cancelAppointment(owner, org.id, b.id);
  const moved = await cal.rescheduleAppointment(
    owner,
    org.id,
    a.id,
    b.startsAt,
  );
  assert.equal(moved.status, "rescheduled");
  assert.equal(moved.startsAt, b.startsAt);
});

test("google calendar connection pending without OAuth creds", async () => {
  const { tenancy, cal } = setup();
  const owner = await tenancy.signUp({
    email: "owner-cal3@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Cal Co 3" });
  const connections = await cal.listCalendarConnections(owner, org.id);
  const google = connections.find((c) => c.provider === "google");
  assert.ok(google);
  assert.equal(google!.status, "pending_configuration");
});

test("site visit requires address", async () => {
  const { tenancy, cal } = setup();
  const owner = await tenancy.signUp({
    email: "owner-cal4@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Cal Co 4" });
  const type = await cal.createAppointmentType(owner, org.id, {
    name: "Site visit",
    kind: "site_visit",
    requiresSiteVisit: true,
    durationMinutes: 60,
  });
  await assert.rejects(
    () =>
      cal.bookAppointment(owner, org.id, {
        appointmentTypeId: type.id,
        assigneeUserId: owner.id,
        startsAt: "2026-10-22T09:00:00.000Z",
      }),
    (err: unknown) => err instanceof AuthError && err.code === "validation",
  );
  const ok = await cal.bookAppointment(owner, org.id, {
    appointmentTypeId: type.id,
    assigneeUserId: owner.id,
    startsAt: "2026-10-22T09:00:00.000Z",
    siteVisitAddress: "123 Main St",
  });
  assert.equal(ok.siteVisitAddress, "123 Main St");
});
