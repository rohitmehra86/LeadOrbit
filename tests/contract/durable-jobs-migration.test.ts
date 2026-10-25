import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd());

test("00007 defines durable_jobs base table", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/00007_workflows_inbox.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.durable_jobs/);
  assert.match(sql, /idempotency_key text unique/);
});

test("00022 hardens durable_jobs with SKIP LOCKED claim and service_role RPCs", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/00022_durable_jobs_claim_rpc.sql"),
    "utf8",
  );
  assert.match(sql, /locked_by/);
  assert.match(sql, /max_attempts/);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /create or replace function public\.enqueue_durable_job/);
  assert.match(sql, /create or replace function public\.claim_durable_jobs/);
  assert.match(sql, /create or replace function public\.complete_durable_job/);
  assert.match(sql, /create or replace function public\.fail_durable_job/);
  assert.match(sql, /create or replace function public\.recover_stale_durable_jobs/);
  assert.match(sql, /grant execute on function public\.claim_durable_jobs/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.claim_durable_jobs\([^)]+\)\s+to anon/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.enqueue_durable_job\([^)]+\)\s+to authenticated/i,
  );
});
