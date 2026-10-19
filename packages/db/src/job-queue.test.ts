import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";

test("sqlite job queue idempotent enqueue and claim/complete", () => {
  const dir = mkdtempSync(join(tmpdir(), "lo-jq-"));
  const db = openCrmDatabase(join(dir, "q.sqlite"));
  const q = new SqliteJobQueue(db);
  const a = q.enqueue(
    "workflow.tick",
    { orgId: "o1", enrollmentId: "e1" },
    { idempotencyKey: "k1" },
  );
  const b = q.enqueue(
    "workflow.tick",
    { orgId: "o1", enrollmentId: "e1" },
    { idempotencyKey: "k1" },
  );
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(a.jobId, b.jobId);

  const claimed = q.claimDue(5);
  assert.equal(claimed.length, 1);
  q.complete(claimed[0]!.id);
  assert.equal(q.claimDue(5).length, 0);
});

test("sqlite job queue retries then dead-letters", () => {
  const dir = mkdtempSync(join(tmpdir(), "lo-jq2-"));
  const db = openCrmDatabase(join(dir, "q.sqlite"));
  const q = new SqliteJobQueue(db);
  const { jobId } = q.enqueue("message.send", {
    orgId: "o",
    messageId: "m",
  });
  const [job] = q.claimDue(1);
  assert.ok(job);
  q.fail(jobId, "boom", { retryDelayMs: 0 });
  db.prepare(`update durable_jobs set run_at=? where id=?`).run(
    new Date(0).toISOString(),
    jobId,
  );
  const [again] = q.claimDue(1);
  assert.ok(again);
  q.fail(jobId, "boom2", { deadLetter: true });
  const counts = q.countByStatus();
  assert.equal(counts.dead_letter, 1);
});
