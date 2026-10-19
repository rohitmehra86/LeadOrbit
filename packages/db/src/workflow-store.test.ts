import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { CrmStore } from "./crm-store";
import { SqliteJobQueue } from "./job-queue";
import { WorkflowStore } from "./workflow-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-wf-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const crm = new CrmStore(tenancy, db);
  const wf = new WorkflowStore(tenancy, db, queue, crm);
  return { tenancy, crm, wf, queue, db };
}

test("cross-tenant workflow list forbidden", async () => {
  const { tenancy, wf } = setup();
  const alice = await tenancy.signUp({
    email: "a-wf@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "b-wf@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, { name: "Org A WF" });
  await tenancy.createOrganization(bob, { name: "Org B WF" });
  await wf.createWorkflow(alice, orgA.id, { name: "Nurture" });
  await assert.rejects(
    () => wf.listWorkflows(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("durable workflow execution with retry idempotency and wait", async () => {
  const { tenancy, crm, wf, queue, db } = setup();
  const owner = await tenancy.signUp({
    email: "owner-wf@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "WF Co" });
  crm.registerOrg(org.id, org.name);
  const lead = await crm.createLead(owner, org.id, {
    fullName: "Flow Lead",
    email: "flow@example.com",
  });

  const workflow = await wf.createWorkflow(owner, org.id, {
    name: "Lead nurture",
    template: "lead_created",
    testMode: true,
  });
  // Shorten wait for test
  const graph = {
    ...workflow.graph,
    nodes: workflow.graph.nodes.map((n) =>
      n.type === "wait" ? { ...n, config: { delayMs: 1 } } : n,
    ),
  };
  await wf.updateWorkflow(owner, org.id, workflow.id, { graph });
  await wf.publishWorkflow(owner, org.id, workflow.id);

  const first = await wf.enroll(owner, org.id, {
    workflowId: workflow.id,
    leadId: lead.id,
    idempotencyKey: "enroll-1",
    testMode: true,
    context: { email: "flow@example.com" },
  });
  assert.equal(first.duplicate, false);

  const second = await wf.enroll(owner, org.id, {
    workflowId: workflow.id,
    leadId: lead.id,
    idempotencyKey: "enroll-1",
    testMode: true,
  });
  assert.equal(second.duplicate, true);

  // Drive ticks directly (same code path as worker) until terminal/waiting.
  for (let i = 0; i < 15; i++) {
    await wf.processTick(org.id, first.enrollment.id);
    const [en] = await wf.listEnrollments(owner, org.id, workflow.id);
    if (!en) break;
    if (["completed", "failed", "waiting"].includes(en.status)) break;
  }

  // Also drain any queued jobs to prove queue claim/complete path.
  db.prepare(`update durable_jobs set run_at=? where status='pending'`).run(
    new Date().toISOString(),
  );
  for (const job of queue.claimDue(50)) {
    if (job.name === "workflow.tick") {
      const p = job.payload as { orgId: string; enrollmentId: string };
      await wf.processTick(p.orgId, p.enrollmentId);
    }
    queue.complete(job.id);
  }

  const enrollments = await wf.listEnrollments(owner, org.id, workflow.id);
  assert.equal(enrollments.length, 1);
  assert.ok(
    ["completed", "waiting", "active"].includes(enrollments[0]!.status),
  );
  const steps = await wf.listStepRuns(owner, org.id, enrollments[0]!.id);
  assert.ok(steps.length >= 1, `expected step runs, got ${steps.length}`);
  const counts = queue.countByStatus();
  assert.ok((counts.completed ?? 0) + (counts.pending ?? 0) >= 1);
});
