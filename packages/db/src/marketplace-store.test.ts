import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketplaceStore } from "./marketplace-store";
import { LocalTenancyStore } from "./tenancy-store";
import { resetCrmDatabaseForTests } from "./sqlite";

async function setup() {
  resetCrmDatabaseForTests(":memory:");
  const tenancy = new LocalTenancyStore();
  const signed = await tenancy.signUp({
    email: `mp-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
  });
  const owner = (await tenancy.getUser(signed.id))!;
  const org = await tenancy.createOrganization(owner, { name: "Market Co" });
  const store = new MarketplaceStore(tenancy);
  return { owner, org, store };
}

test("catalog lists packs and resolveInstallPlan returns goal", async () => {
  const { store } = await setup();
  const catalog = store.listCatalog(true);
  assert.ok(catalog.length >= 4);
  const plan = store.resolveInstallPlan("general-lead-gen");
  assert.equal(plan.pack.slug, "general-lead-gen");
  assert.ok(plan.goal.length > 0);
});

test("recordInstall persists history", async () => {
  const { owner, org, store } = await setup();
  const plan = store.resolveInstallPlan("real-estate-site-visit");
  const row = await store.recordInstall(owner, org.id, {
    packId: plan.pack.id,
    packSlug: plan.pack.slug,
    campaignId: "camp_1",
    formId: "form_1",
    pageId: "page_1",
    pageSlug: "launch-abc",
    detail: "Installed draft",
  });
  assert.equal(row.packSlug, "real-estate-site-visit");
  const list = await store.listInstalls(owner, org.id);
  assert.equal(list.length, 1);
});
