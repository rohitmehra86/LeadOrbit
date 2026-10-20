import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CrmStore,
  getCrmDatabase,
  getLocalTenancyStore,
  IngestionStore,
} from "@leadorbit/db";

test("local pullLeadAds with fixture persists normalized Meta lead", async () => {
  process.env.AUTH_MODE = "local";
  process.env.META_ADS_ACCESS_TOKEN = "test-token";
  const tenancy = getLocalTenancyStore();
  const user = await tenancy.signUp({
    email: `w4-ads-${Date.now()}@example.com`,
    password: "TestPass123!",
    fullName: "Ads Tester",
  });
  const org = await tenancy.createOrganization(user, { name: "Ads Org" });
  const crm = new CrmStore(tenancy);
  crm.registerOrg(org.id, org.name);
  const ingestion = new IngestionStore(tenancy);
  ingestion.setCrmStore(crm);
  void getCrmDatabase();

  const pulled = await ingestion.pullLeadAds(user, org.id, "meta_lead_ads", {
    fixtureLeads: [
      {
        id: `meta-fx-${Date.now()}`,
        field_data: [
          { name: "full_name", values: ["Wave4 Fixture"] },
          { name: "email", values: [`w4fx-${Date.now()}@example.com`] },
        ],
      },
    ],
  });
  assert.equal(pulled.status, "imported");
  assert.equal(pulled.imported, 1);
  const leads = await crm.listLeads(user, org.id);
  assert.ok(leads.some((l) => l.fullName === "Wave4 Fixture"));
  delete process.env.META_ADS_ACCESS_TOKEN;
});

test("local pullLeadAds without credentials stays pending_configuration", async () => {
  delete process.env.META_ADS_ACCESS_TOKEN;
  const tenancy = getLocalTenancyStore();
  const user = await tenancy.signUp({
    email: `w4-pending-${Date.now()}@example.com`,
    password: "TestPass123!",
    fullName: "Pending Tester",
  });
  const org = await tenancy.createOrganization(user, { name: "Pending Ads Org" });
  const crm = new CrmStore(tenancy);
  crm.registerOrg(org.id, org.name);
  const ingestion = new IngestionStore(tenancy);
  ingestion.setCrmStore(crm);
  const pulled = await ingestion.pullLeadAds(user, org.id, "meta_lead_ads");
  assert.equal(pulled.status, "pending_configuration");
  assert.equal(pulled.imported, 0);
});
