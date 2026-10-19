import assert from "node:assert/strict";
import { test } from "node:test";
import { AnalyticsStore } from "./analytics-store";
import { LocalTenancyStore } from "./tenancy-store";
import { resetCrmDatabaseForTests, getCrmDatabase } from "./sqlite";

async function setup() {
  resetCrmDatabaseForTests(":memory:");
  const db = getCrmDatabase();
  const tenancy = new LocalTenancyStore();
  const owner = await tenancy.signUp({
    email: `a-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Analytics Co" });
  const analytics = new AnalyticsStore(tenancy, db);
  return { db, tenancy, owner, org, analytics };
}

test("dashboard distinguishes zero vs unavailable and aggregates real leads", async () => {
  const { db, owner, org, analytics } = await setup();
  const now = new Date().toISOString();
  const from = new Date(Date.now() - 7 * 864e5).toISOString();
  const to = new Date(Date.now() + 864e5).toISOString();

  db.prepare(
    `insert into leads(
      id, org_id, email, phone, full_name, company_id, contact_id, source, status,
      lifecycle_stage, score, owner_user_id, territory, pipeline_id, stage_id,
      idempotency_key, custom_fields, sla_due_at, sla_state, created_at, updated_at
    ) values (?,?,?,?,?,null,null,?,?,?,?,?,?,null,null,?, '{}',null,'ok',?,?)`,
  ).run(
    "lead1",
    org.id,
    "a@x.com",
    null,
    "Ada",
    "web",
    "new",
    "subscriber",
    60,
    owner.id,
    null,
    "idem-1",
    now,
    now,
  );

  const dash = await analytics.dashboard(owner, org.id, { from, to });
  const leads = dash.metrics.find((m) => m.key === "leads_total");
  assert.ok(leads);
  assert.equal(leads!.availability, "ok");
  assert.equal(leads!.value, 1);

  const emptyFrom = "2000-01-01T00:00:00.000Z";
  const emptyTo = "2000-01-02T00:00:00.000Z";
  const emptyDash = await analytics.dashboard(owner, org.id, {
    from: emptyFrom,
    to: emptyTo,
  });
  const zeroLeads = emptyDash.metrics.find((m) => m.key === "leads_total");
  assert.equal(zeroLeads!.availability, "zero");
  assert.equal(zeroLeads!.value, 0);

  const csv = await analytics.exportCsv(owner, org.id, { from, to });
  assert.ok(csv.csv.includes("channel") || csv.csv.includes("web"));
});

test("scheduled report scaffolding enqueues job name", async () => {
  const { owner, org, analytics } = await setup();
  const report = await analytics.scheduleReport(owner, org.id, {
    name: "Weekly summary",
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  assert.equal(report.status, "scaffolded");
  const list = await analytics.listScheduledReports(owner, org.id);
  assert.equal(list.length, 1);
});
