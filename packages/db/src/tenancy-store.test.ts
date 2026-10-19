import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthError, LocalTenancyStore } from "./tenancy-store";

test("cross-tenant org read is forbidden at service layer", async () => {
  const store = new LocalTenancyStore();
  const alice = await store.signUp({
    email: "alice@example.com",
    password: "password123",
    fullName: "Alice",
  });
  const bob = await store.signUp({
    email: "bob@example.com",
    password: "password123",
    fullName: "Bob",
  });
  const aliceOrg = await store.createOrganization(alice, { name: "Alice Agency" });
  await store.createOrganization(bob, { name: "Bob Workspace" });

  await assert.rejects(
    () => store.getOrganization(bob, aliceOrg.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );

  // Data exists but must not be readable via authorized API
  assert.ok(await store.getOrganizationUncheckedForTests(aliceOrg.id));
});

test("invite accept joins org; wrong email forbidden", async () => {
  const store = new LocalTenancyStore();
  const owner = await store.signUp({
    email: "owner@example.com",
    password: "password123",
  });
  const invitee = await store.signUp({
    email: "agent@example.com",
    password: "password123",
  });
  const stranger = await store.signUp({
    email: "stranger@example.com",
    password: "password123",
  });
  const org = await store.createOrganization(owner, { name: "Orbit Realty" });
  const invite = await store.createInvite(owner, org.id, "agent@example.com", "agent");
  assert.ok(invite.token);

  await assert.rejects(
    () => store.acceptInvite(stranger, invite.token!),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );

  const membership = await store.acceptInvite(invitee, invite.token!);
  assert.equal(membership.role, "agent");
  assert.equal(membership.orgId, org.id);

  const orgs = await store.listOrganizationsForUser(invitee.id);
  assert.equal(orgs.length, 1);
  assert.equal(orgs[0]?.id, org.id);
});

test("viewer cannot update settings", async () => {
  const store = new LocalTenancyStore();
  const owner = await store.signUp({
    email: "o@example.com",
    password: "password123",
  });
  const viewer = await store.signUp({
    email: "v@example.com",
    password: "password123",
  });
  const org = await store.createOrganization(owner, { name: "Settings Co" });
  const invite = await store.createInvite(owner, org.id, "v@example.com", "viewer");
  await store.acceptInvite(viewer, invite.token!);

  await assert.rejects(
    () =>
      store.updateOrganizationSettings(viewer, org.id, { timezone: "Asia/Kolkata" }),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("platform admin can list all orgs; audit records grant", async () => {
  const store = new LocalTenancyStore();
  const admin = await store.signUp({
    email: "admin@leadorbit.local",
    password: "password123",
  });
  store.bootstrapPlatformAdmin(admin.id);
  const refreshed = await store.getUser(admin.id);
  assert.equal(refreshed?.isPlatformAdmin, true);

  const tenant = await store.signUp({
    email: "t@example.com",
    password: "password123",
  });
  await store.createOrganization(tenant, { name: "Tenant A" });
  const all = await store.listAllOrgsAsPlatformAdmin(refreshed!);
  assert.equal(all.length, 1);
});
