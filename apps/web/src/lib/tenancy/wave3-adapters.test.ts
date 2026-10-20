import assert from "node:assert/strict";
import { test } from "node:test";
import { convertLoopWorkflow } from "@leadorbit/domain";
import {
  getLocalTenancyStore,
  WorkflowStore,
  SqliteJobQueue,
  getCrmDatabase,
  CrmStore,
} from "@leadorbit/db";

test("local convert_loop workflow template creates form_submitted graph", async () => {
  const tenancy = getLocalTenancyStore();
  const owner = await tenancy.signUp({
    email: `wave3-owner-${Date.now()}@example.com`,
    password: "TestPass123!",
    fullName: "Wave3 Owner",
  });
  const org = await tenancy.createOrganization(owner, { name: "Wave3 Org" });
  const crm = new CrmStore(tenancy);
  crm.registerOrg(org.id, org.name);
  const db = getCrmDatabase();
  const wf = new WorkflowStore(tenancy, db, new SqliteJobQueue(db), crm);
  const created = await wf.createWorkflow(owner, org.id, {
    name: "Convert loop",
    template: "convert_loop",
  });
  assert.equal(created.status, "draft");
  assert.equal(created.graph.nodes[0]?.type, "form_submitted");
  assert.deepEqual(
    created.graph.nodes.map((n) => n.type),
    convertLoopWorkflow().nodes.map((n) => n.type),
  );
});
