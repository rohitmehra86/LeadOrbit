import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryJobQueue } from "./queue.js";

test("enqueue returns a job id", async () => {
  const q = new InMemoryJobQueue();
  const { jobId } = await q.enqueue("lead.score", {
    orgId: "00000000-0000-4000-8000-000000000001",
    leadId: "00000000-0000-4000-8000-000000000002",
  });
  assert.ok(jobId.length > 0);
  await q.stop();
});
