import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { CrmStore } from "./crm-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-crm-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const crm = new CrmStore(tenancy, db);
  return { tenancy, crm };
}

test("cross-tenant lead list forbidden", async () => {
  const { tenancy, crm } = setup();
  const alice = await tenancy.signUp({
    email: "a-crm@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "b-crm@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, { name: "Org A CRM" });
  await tenancy.createOrganization(bob, { name: "Org B CRM" });
  crm.registerOrg(orgA.id, orgA.name);
  await crm.createLead(alice, orgA.id, { fullName: "Lead One", email: "l1@x.com" });

  await assert.rejects(
    () => crm.listLeads(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("idempotent lead create and csv import skip duplicates", async () => {
  const { tenancy, crm } = setup();
  const owner = await tenancy.signUp({
    email: "owner-crm@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Import Co" });
  crm.registerOrg(org.id, org.name);
  const a = await crm.createLead(owner, org.id, {
    fullName: "Same",
    email: "same@x.com",
    idempotencyKey: "k1",
  });
  const b = await crm.createLead(owner, org.id, {
    fullName: "Same again",
    email: "same@x.com",
    idempotencyKey: "k1",
  });
  assert.equal(a.id, b.id);

  const imp = await crm.importLeadsCsv(
    owner,
    org.id,
    "full_name,email,source\nSame,same@x.com,csv\nOther,other@x.com,csv",
  );
  assert.equal(imp.skipped, 1);
  assert.equal(imp.created, 1);
});

test("round robin assignment and ownership history", async () => {
  const { tenancy, crm } = setup();
  const owner = await tenancy.signUp({
    email: "rr-owner@example.com",
    password: "password123",
  });
  const agent = await tenancy.signUp({
    email: "rr-agent@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "RR Co" });
  crm.registerOrg(org.id, org.name);
  const invite = await tenancy.createInvite(owner, org.id, "rr-agent@example.com", "agent");
  await tenancy.acceptInvite(agent, invite.token!);
  await crm.upsertAssignmentRule(owner, org.id, {
    name: "RR",
    strategy: "round_robin",
    enabled: true,
    config: { userIds: [owner.id, agent.id], roundRobinCursor: 0 },
  });
  const l1 = await crm.createLead(owner, org.id, {
    fullName: "L1",
    assignStrategy: "round_robin",
  });
  const l2 = await crm.createLead(owner, org.id, {
    fullName: "L2",
    assignStrategy: "round_robin",
  });
  assert.equal(l1.ownerUserId, owner.id);
  assert.equal(l2.ownerUserId, agent.id);
  const hist = await crm.listOwnershipHistory(owner, org.id, "lead", l1.id);
  assert.ok(hist.length >= 1);
});

test("merge leads moves notes and deletes secondary", async () => {
  const { tenancy, crm } = setup();
  const owner = await tenancy.signUp({
    email: "merge@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Merge Co" });
  crm.registerOrg(org.id, org.name);
  const primary = await crm.createLead(owner, org.id, {
    fullName: "Primary",
    email: "p@x.com",
  });
  const secondary = await crm.createLead(owner, org.id, {
    fullName: "Secondary",
    phone: "+15551212",
  });
  await crm.addNote(owner, org.id, {
    body: "hello",
    entityType: "lead",
    entityId: secondary.id,
  });
  const merged = await crm.mergeLeads(owner, org.id, primary.id, secondary.id);
  assert.equal(merged.phone, "+15551212");
  await assert.rejects(() => crm.getLead(owner, org.id, secondary.id));
  const timeline = await crm.listActivities(owner, org.id, "lead", primary.id);
  assert.ok(timeline.some((a) => a.activityType === "note.added"));
});
