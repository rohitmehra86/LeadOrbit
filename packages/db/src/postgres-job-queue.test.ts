import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthMode } from "./config";
import {
  computeRetryDelayMs,
  createPostgresJobQueueForTests,
  getJobQueue,
  resetJobQueueForTests,
  sanitizeJobError,
  SqliteJobQueue,
} from "./job-queue";
import { openCrmDatabase, resetCrmDatabaseForTests } from "./sqlite";

const ORG = "33333333-3333-4333-8333-333333333333";

test("computeRetryDelayMs stays bounded with jitter", () => {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const delay = computeRetryDelayMs(attempt, 1000, 10_000);
    assert.ok(delay >= 250);
    assert.ok(delay <= 10_000);
  }
});

test("sanitizeJobError redacts secrets and emails", () => {
  const out = sanitizeJobError(
    "token sk_live_abc123 and user@example.com Bearer xyz",
  );
  assert.match(out, /\[redacted\]/);
  assert.doesNotMatch(out, /sk_live_abc123/);
  assert.doesNotMatch(out, /user@example.com/);
});

test("supabase mode getJobQueue refuses SQLite fallback without service role", () => {
  const prev = {
    AUTH_MODE: process.env.AUTH_MODE,
    URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetJobQueueForTests();
  assert.equal(getAuthMode(), "supabase");
  assert.throws(() => getJobQueue(), /refusing SQLite fallback|SERVICE_ROLE/i);
  if (prev.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = prev.AUTH_MODE;
  if (prev.URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.URL;
  if (prev.ANON === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.ANON;
  if (prev.SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SERVICE;
  resetJobQueueForTests();
});

test("PostgresJobQueue enqueue/idempotency/claim/complete via mocked RPC", async () => {
  const jobs = new Map<
    string,
    {
      id: string;
      name: string;
      payload: unknown;
      status: string;
      attempts: number;
      maxAttempts: number;
      runAt: string;
      lastError: string | null;
      idempotencyKey: string | null;
    }
  >();

  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "enqueue_durable_job") {
        const key = (args.p_idempotency_key as string | null) ?? null;
        if (key) {
          for (const j of jobs.values()) {
            if (j.idempotencyKey === key) {
              return {
                data: { jobId: j.id, duplicate: true, status: j.status },
                error: null,
              };
            }
          }
        }
        const id = crypto.randomUUID();
        jobs.set(id, {
          id,
          name: String(args.p_name),
          payload: args.p_payload,
          status: "pending",
          attempts: 0,
          maxAttempts: Number(args.p_max_attempts ?? 5),
          runAt: new Date().toISOString(),
          lastError: null,
          idempotencyKey: key,
        });
        return { data: { jobId: id, duplicate: false, status: "pending" }, error: null };
      }
      if (fn === "claim_durable_jobs") {
        const limit = Number(args.p_limit ?? 10);
        const claimed = [];
        for (const j of jobs.values()) {
          if (j.status !== "pending") continue;
          j.status = "running";
          j.attempts += 1;
          claimed.push({
            id: j.id,
            name: j.name,
            payload: j.payload,
            status: j.status,
            attempts: j.attempts,
            maxAttempts: j.maxAttempts,
            runAt: j.runAt,
            lastError: j.lastError,
          });
          if (claimed.length >= limit) break;
        }
        return { data: claimed, error: null };
      }
      if (fn === "complete_durable_job") {
        const j = jobs.get(String(args.p_job_id));
        if (j) j.status = "completed";
        return { data: { ok: true }, error: null };
      }
      if (fn === "fail_durable_job") {
        const j = jobs.get(String(args.p_job_id));
        if (!j) return { data: { ok: false }, error: null };
        if (args.p_dead_letter || args.p_retry_delay_ms == null) {
          j.status = "dead_letter";
        } else {
          j.status = "pending";
          j.lastError = String(args.p_error);
        }
        return { data: { ok: true, status: j.status }, error: null };
      }
      if (fn === "recover_stale_durable_jobs") {
        let recovered = 0;
        for (const j of jobs.values()) {
          if (j.status === "running") {
            j.status = "pending";
            recovered += 1;
          }
        }
        return { data: { recovered }, error: null };
      }
      if (fn === "count_durable_jobs_by_status") {
        const counts: Record<string, number> = {};
        for (const j of jobs.values()) {
          counts[j.status] = (counts[j.status] ?? 0) + 1;
        }
        return { data: counts, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
  };

  const q = createPostgresJobQueueForTests(client, "w1");
  const a = await q.enqueue(
    "workflow.tick",
    { orgId: ORG, enrollmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    { idempotencyKey: "idem-1" },
  );
  const b = await q.enqueue(
    "workflow.tick",
    { orgId: ORG, enrollmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    { idempotencyKey: "idem-1" },
  );
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(a.jobId, b.jobId);

  const claimed = await q.claimDue(5, "w1");
  assert.equal(claimed.length, 1);
  await q.complete(claimed[0]!.id);
  const counts = await q.countByStatus();
  assert.equal(counts.completed, 1);
});

test("PostgresJobQueue concurrent claim returns disjoint sets", async () => {
  const pending = [
    { id: "1", name: "message.send", payload: { orgId: ORG, messageId: "m1" } },
    { id: "2", name: "message.send", payload: { orgId: ORG, messageId: "m2" } },
    { id: "3", name: "message.send", payload: { orgId: ORG, messageId: "m3" } },
  ];
  const locked = new Set<string>();
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== "claim_durable_jobs") {
        return { data: null, error: { message: "unexpected" } };
      }
      const limit = Number(args.p_limit ?? 1);
      const out = [];
      for (const job of pending) {
        if (locked.has(job.id)) continue;
        locked.add(job.id);
        out.push({
          id: job.id,
          name: job.name,
          payload: job.payload,
          status: "running",
          attempts: 1,
          maxAttempts: 5,
          runAt: new Date().toISOString(),
          lastError: null,
        });
        if (out.length >= limit) break;
      }
      return { data: out, error: null };
    },
  };
  const w1 = createPostgresJobQueueForTests(client, "w1");
  const w2 = createPostgresJobQueueForTests(client, "w2");
  const [a, b] = await Promise.all([w1.claimDue(2, "w1"), w2.claimDue(2, "w2")]);
  const ids = [...a, ...b].map((j) => j.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 2);
});

test("PostgresJobQueue retries then dead-letters; recover stale running jobs", async () => {
  let job = {
    id: "job-1",
    status: "pending",
    attempts: 0,
    maxAttempts: 2,
    lastError: null as string | null,
  };
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "enqueue_durable_job") {
        return { data: { jobId: job.id, duplicate: false }, error: null };
      }
      if (fn === "claim_durable_jobs") {
        if (job.status !== "pending") return { data: [], error: null };
        job.status = "running";
        job.attempts += 1;
        return {
          data: [
            {
              id: job.id,
              name: "message.send",
              payload: { orgId: ORG, messageId: "m" },
              status: "running",
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              runAt: new Date().toISOString(),
              lastError: job.lastError,
            },
          ],
          error: null,
        };
      }
      if (fn === "fail_durable_job") {
        if (args.p_dead_letter || args.p_retry_delay_ms == null) {
          job.status = "dead_letter";
        } else {
          job.status = "pending";
          job.lastError = String(args.p_error);
        }
        return { data: { ok: true, status: job.status }, error: null };
      }
      if (fn === "recover_stale_durable_jobs") {
        if (job.status === "running") {
          job.status = "pending";
          return { data: { recovered: 1 }, error: null };
        }
        return { data: { recovered: 0 }, error: null };
      }
      return { data: null, error: { message: fn } };
    },
  };
  const q = createPostgresJobQueueForTests(client);
  await q.enqueue("message.send", { orgId: ORG, messageId: "m" });
  const [first] = await q.claimDue(1);
  assert.ok(first);
  await q.fail(first.id, "boom", { retryDelayMs: 1 });
  assert.equal(job.status, "pending");
  const [second] = await q.claimDue(1);
  assert.ok(second);
  await q.fail(second.id, "boom2", { deadLetter: true });
  assert.equal(job.status, "dead_letter");

  job = { ...job, status: "running", attempts: 1, lastError: null };
  const recovered = await q.recoverStale(1);
  assert.equal(recovered, 1);
  assert.equal(job.status, "pending");
});

test("sqlite queue still supports concurrent claim semantics and crash recovery", () => {
  resetCrmDatabaseForTests(":memory:");
  const db = openCrmDatabase(":memory:");
  const q = new SqliteJobQueue(db);
  q.enqueue("message.send", { orgId: ORG, messageId: "a" });
  q.enqueue("message.send", { orgId: ORG, messageId: "b" });
  const c1 = q.claimDue(1, "w1");
  const c2 = q.claimDue(1, "w2");
  assert.equal(c1.length, 1);
  assert.equal(c2.length, 1);
  assert.notEqual(c1[0]!.id, c2[0]!.id);

  // Simulate abandoned lease
  db.prepare(
    `update durable_jobs set locked_at=? where id=?`,
  ).run(new Date(0).toISOString(), c1[0]!.id);
  const recovered = q.recoverStale(1);
  assert.equal(recovered, 1);
});

test("unknown job type and invalid orgId are rejected at enqueue", () => {
  resetCrmDatabaseForTests(":memory:");
  const q = new SqliteJobQueue(openCrmDatabase(":memory:"));
  assert.throws(
    () =>
      q.enqueue("not.a.job" as never, {
        orgId: ORG,
      } as never),
    /Unknown job type/,
  );
  assert.throws(
    () => q.enqueue("message.send", { orgId: "bad", messageId: "m" }),
    /orgId must be a UUID/,
  );
});
