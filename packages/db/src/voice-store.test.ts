import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";
import { CalendarStore } from "./calendar-store";
import { VoiceStore } from "./voice-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-voice-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const cal = new CalendarStore(tenancy, db, queue);
  const voice = new VoiceStore(tenancy, db, queue, cal);
  return { tenancy, cal, voice };
}

test("outbound call without creds is pending_configuration — not live success", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  const { tenancy, voice } = setup();
  const owner = await tenancy.signUp({
    email: "owner-voice@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Voice Co" });
  await voice.updatePolicy(owner, org.id, { legalOutboundAllowed: true });
  const call = await voice.startOutboundCall(owner, org.id, {
    toNumber: "+15551212",
    recordingConsent: true,
  });
  assert.equal(call.status, "pending_configuration");
  assert.ok(call.detail);

  voice.processCall(org.id, call.id);
  const [processed] = await voice.listCalls(owner, org.id);
  assert.ok(
    processed!.transcriptStatus === "scaffolded" ||
      processed!.transcriptStatus === "skipped",
  );
});

test("outbound blocked when legal flag off", async () => {
  const { tenancy, voice } = setup();
  const owner = await tenancy.signUp({
    email: "owner-voice2@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Voice Co 2" });
  const call = await voice.startOutboundCall(owner, org.id, {
    toNumber: "+15551212",
    recordingConsent: true,
  });
  assert.equal(call.status, "pending_configuration");
  assert.match(call.detail ?? "", /not legally permitted/i);
});

test("book appointment from call uses calendar conflict rules", async () => {
  const { tenancy, cal, voice } = setup();
  const owner = await tenancy.signUp({
    email: "owner-voice3@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Voice Co 3" });
  const type = await cal.createAppointmentType(owner, org.id, {
    name: "Callback",
    kind: "callback",
    durationMinutes: 30,
  });
  const inbound = await voice.acceptInboundCall(owner, org.id, {
    fromNumber: "+15550001",
    toNumber: "+15550002",
    recordingConsent: true,
    aiAssisted: true,
  });
  const { appointmentId, call } = await voice.bookAppointmentFromCall(
    owner,
    org.id,
    inbound.id,
    {
      appointmentTypeId: type.id,
      startsAt: "2026-10-23T14:00:00.000Z",
    },
  );
  assert.ok(appointmentId);
  assert.equal(call.outcome, "appointment_booked");
});
