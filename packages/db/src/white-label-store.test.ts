import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthError } from "./tenancy-store";
import { LocalTenancyStore } from "./tenancy-store";
import { BillingStore } from "./billing-store";
import { WhiteLabelStore } from "./white-label-store";
import { resetCrmDatabaseForTests } from "./sqlite";

async function setup() {
  resetCrmDatabaseForTests(":memory:");
  const tenancy = new LocalTenancyStore();
  const signed = await tenancy.signUp({
    email: `wl-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
  });
  tenancy.bootstrapPlatformAdmin(signed.id);
  const owner = (await tenancy.getUser(signed.id))!;
  const org = await tenancy.createOrganization(owner, {
    name: "Agency WL",
    orgType: "agency",
  });
  const billing = new BillingStore(tenancy);
  billing.ensureTrialSubscription(org.id);
  const wl = new WhiteLabelStore(tenancy, undefined, billing);
  return { tenancy, owner, org, billing, wl };
}

test("white-label write gated by entitlement; allowed after growth plan", async () => {
  const { owner, org, billing, wl } = await setup();

  await assert.rejects(
    () =>
      wl.updateBrand(owner, org.id, {
        logoUrl: "https://cdn.example.com/logo.png",
        primaryColor: "#0B3D2E",
      }),
    (err: unknown) => err instanceof AuthError && /not entitled/i.test(err.message),
  );

  await billing.platformSetSubscription(owner, org.id, {
    planCode: "growth_monthly",
    status: "active",
  });

  const brand = await wl.updateBrand(owner, org.id, {
    logoUrl: "https://cdn.example.com/logo.png",
    primaryColor: "#0B3D2E",
    loginHeadline: "Welcome back",
    hideLeadOrbitBranding: true,
  });
  assert.equal(brand.logoUrl, "https://cdn.example.com/logo.png");
  assert.equal(brand.hideLeadOrbitBranding, true);

  const domain = await wl.addDomain(owner, org.id, "crm.client.example.com");
  assert.equal(domain.status, "pending");
  assert.ok(domain.txtChallenge?.startsWith("leadorbit-verify="));

  const verified = await wl.verifyDomain(owner, org.id, domain.id, async () => [
    domain.txtChallenge!,
  ]);
  assert.equal(verified.status, "verified");

  const pending = await wl.verifyDomain(owner, org.id, domain.id, async () => []);
  assert.equal(pending.status, "pending");

  const vis = await wl.featureVisibility(owner, org.id);
  assert.ok(vis.features.includes("white_label"));
});

test("agency management scaffolding links child org", async () => {
  const { tenancy, owner, org, billing, wl } = await setup();
  await billing.platformSetSubscription(owner, org.id, {
    planCode: "growth_monthly",
    status: "active",
  });
  const child = await tenancy.createOrganization(owner, { name: "Child Workspace" });
  const link = await wl.linkAgencyChild(owner, org.id, child.id, "Client A");
  assert.equal(link.childOrgId, child.id);
  const list = await wl.listAgencyChildren(owner, org.id);
  assert.equal(list.length, 1);
});
