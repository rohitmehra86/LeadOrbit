import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { JobName, JobPayloadMap } from "@leadorbit/domain";
import { getAuthMode } from "./config";
import { getCrmDatabase } from "./sqlite";

export type DurableJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "dead_letter";

export interface DurableJob<N extends JobName = JobName> {
  id: string;
  name: N;
  payload: JobPayloadMap[N];
  status: DurableJobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lastError: string | null;
}

export type EnqueueResult = { jobId: string; duplicate: boolean };

export type FailJobOptions = {
  retryDelayMs?: number | null;
  deadLetter?: boolean;
};

export interface DurableJobQueue {
  enqueue<N extends JobName>(
    name: N,
    payload: JobPayloadMap[N],
    opts?: { idempotencyKey?: string; delayMs?: number; maxAttempts?: number },
  ): EnqueueResult | Promise<EnqueueResult>;
  claimDue(
    limit?: number,
    workerId?: string,
  ): DurableJob[] | Promise<DurableJob[]>;
  complete(jobId: string): void | Promise<void>;
  fail(
    jobId: string,
    error: string,
    opts?: FailJobOptions,
  ): void | Promise<void>;
  recoverStale?(leaseSeconds?: number): number | Promise<number>;
  countByStatus(): Record<string, number> | Promise<Record<string, number>>;
}

const KNOWN_JOB_NAMES = new Set<string>([
  "lead.score",
  "workflow.run_step",
  "workflow.tick",
  "message.send",
  "embedding.upsert",
  "knowledge.reindex",
  "ai.run_turn",
  "appointment.reminder",
  "voice.process",
  "payment.reconcile",
  "ads.sync",
  "report.schedule",
  "partner.webhook.deliver",
]);

export function isKnownJobName(name: string): name is JobName {
  return KNOWN_JOB_NAMES.has(name);
}

/** Bounded exponential backoff with full jitter (ms). */
export function computeRetryDelayMs(attempt: number, baseMs = 2_000, maxMs = 300_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * exp);
  return Math.max(250, jitter);
}

export function sanitizeJobError(error: string): string {
  return error
    .replace(/(sk_live|sk_test|whsec_|rzp_|Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, 2000);
}

export function assertJobPayloadHasOrgId(payload: unknown): asserts payload is {
  orgId: string;
  [key: string]: unknown;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("Job payload must be an object");
  }
  const orgId = (payload as { orgId?: unknown }).orgId;
  if (typeof orgId !== "string" || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    throw new Error("Job payload orgId must be a UUID");
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * SQLite-backed durable job queue for local AUTH_MODE=local.
 */
export class SqliteJobQueue implements DurableJobQueue {
  constructor(private db: DatabaseSync = getCrmDatabase()) {
    this.ensureColumns();
  }

  private ensureColumns(): void {
    try {
      this.db.exec(`alter table durable_jobs add column locked_by text`);
    } catch {
      /* exists */
    }
    try {
      this.db.exec(
        `alter table durable_jobs add column max_attempts integer not null default 5`,
      );
    } catch {
      /* exists */
    }
  }

  enqueue<N extends JobName>(
    name: N,
    payload: JobPayloadMap[N],
    opts?: { idempotencyKey?: string; delayMs?: number; maxAttempts?: number },
  ): EnqueueResult {
    if (!isKnownJobName(name)) {
      throw new Error(`Unknown job type: ${name}`);
    }
    assertJobPayloadHasOrgId(payload);
    const now = nowIso();
    const runAt = new Date(Date.now() + (opts?.delayMs ?? 0)).toISOString();
    const idem = opts?.idempotencyKey ?? null;
    const maxAttempts = Math.min(Math.max(opts?.maxAttempts ?? 5, 1), 50);
    if (idem) {
      const existing = this.db
        .prepare(`select id from durable_jobs where idempotency_key = ?`)
        .get(idem) as { id: string } | undefined;
      if (existing) return { jobId: existing.id, duplicate: true };
    }
    const id = randomUUID();
    try {
      this.db
        .prepare(
          `insert into durable_jobs(
            id, name, payload, status, attempts, run_at, locked_at, locked_by,
            idempotency_key, last_error, created_at, updated_at, max_attempts
          ) values (?,?,?,'pending',0,?,null,null,?,?,?,?,?)`,
        )
        .run(
          id,
          name,
          JSON.stringify(payload),
          runAt,
          idem,
          null,
          now,
          now,
          maxAttempts,
        );
    } catch {
      if (idem) {
        const existing = this.db
          .prepare(`select id from durable_jobs where idempotency_key = ?`)
          .get(idem) as { id: string } | undefined;
        if (existing) return { jobId: existing.id, duplicate: true };
      }
      throw new Error("Failed to enqueue job");
    }
    return { jobId: id, duplicate: false };
  }

  claimDue(limit = 10, workerId = "sqlite-worker"): DurableJob[] {
    this.recoverStale(300);
    const now = nowIso();
    const rows = this.db
      .prepare(
        `select * from durable_jobs
         where status = 'pending' and run_at <= ?
         order by run_at asc limit ?`,
      )
      .all(now, limit) as Record<string, unknown>[];
    const claimed: DurableJob[] = [];
    for (const row of rows) {
      const updated = this.db
        .prepare(
          `update durable_jobs set status='running', locked_at=?, locked_by=?,
           attempts=attempts+1, updated_at=?
           where id=? and status='pending'`,
        )
        .run(now, workerId, now, String(row.id)) as { changes: number };
      if (updated.changes !== 1) continue;
      claimed.push({
        id: String(row.id),
        name: row.name as JobName,
        payload: JSON.parse(String(row.payload)) as JobPayloadMap[JobName],
        status: "running",
        attempts: Number(row.attempts) + 1,
        maxAttempts: Number(row.max_attempts ?? 5),
        runAt: String(row.run_at),
        lastError: row.last_error ? String(row.last_error) : null,
      });
    }
    return claimed;
  }

  complete(jobId: string): void {
    const now = nowIso();
    this.db
      .prepare(
        `update durable_jobs set status='completed', updated_at=?, locked_at=null, locked_by=null, last_error=null where id=?`,
      )
      .run(now, jobId);
  }

  fail(jobId: string, error: string, opts?: FailJobOptions): void {
    const now = nowIso();
    const safe = sanitizeJobError(error);
    const row = this.db
      .prepare(`select attempts, max_attempts from durable_jobs where id=?`)
      .get(jobId) as { attempts: number; max_attempts?: number } | undefined;
    const attempts = Number(row?.attempts ?? 0);
    const maxAttempts = Number(row?.max_attempts ?? 5);
    const shouldDead =
      opts?.deadLetter ||
      opts?.retryDelayMs == null ||
      attempts >= maxAttempts;

    if (shouldDead) {
      this.db
        .prepare(
          `update durable_jobs set status='dead_letter', last_error=?, updated_at=?, locked_at=null, locked_by=null where id=?`,
        )
        .run(safe, now, jobId);
      return;
    }
    const runAt = new Date(Date.now() + (opts?.retryDelayMs ?? 0)).toISOString();
    this.db
      .prepare(
        `update durable_jobs set status='pending', last_error=?, run_at=?, updated_at=?, locked_at=null, locked_by=null where id=?`,
      )
      .run(safe, runAt, now, jobId);
  }

  recoverStale(leaseSeconds = 300): number {
    const cutoff = new Date(Date.now() - leaseSeconds * 1000).toISOString();
    const now = nowIso();
    const result = this.db
      .prepare(
        `update durable_jobs set status='pending', locked_at=null, locked_by=null, updated_at=?,
         last_error=coalesce(last_error, 'lease expired — requeued')
         where status='running' and locked_at is not null and locked_at < ?`,
      )
      .run(now, cutoff) as { changes: number };
    return Number(result.changes ?? 0);
  }

  countByStatus(): Record<string, number> {
    const rows = this.db
      .prepare(`select status, count(*) as c from durable_jobs group by status`)
      .all() as Array<{ status: string; c: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = Number(r.c);
    return out;
  }
}

type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function supabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url =
    env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  return url || null;
}

function serviceRoleKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

/** Fetch-based PostgREST RPC client — service role only, no browser exposure. */
export function createServiceRoleRpcClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): RpcClient {
  const url = supabaseUrl(env);
  const key = serviceRoleKey(env);
  if (!url || !key) {
    throw new Error(
      "Postgres job queue requires SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — refusing SQLite fallback",
    );
  }
  const base = url.replace(/\/$/, "");
  return {
    async rpc(fn, args) {
      const res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(args),
      });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data &&
          "message" in data &&
          typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : `RPC ${fn} HTTP ${res.status}`;
        return { data: null, error: { message: msg } };
      }
      return { data, error: null };
    },
  };
}

function mapClaimedJob(row: Record<string, unknown>): DurableJob {
  return {
    id: String(row.id),
    name: String(row.name) as JobName,
    payload: row.payload as JobPayloadMap[JobName],
    status: "running",
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.maxAttempts ?? row.max_attempts ?? 5),
    runAt: String(row.runAt ?? row.run_at ?? nowIso()),
    lastError:
      row.lastError != null
        ? String(row.lastError)
        : row.last_error != null
          ? String(row.last_error)
          : null,
  };
}

/**
 * Postgres-backed durable job queue for AUTH_MODE=supabase.
 * Never falls back to SQLite.
 */
export class PostgresJobQueue implements DurableJobQueue {
  constructor(
    private client: RpcClient = createServiceRoleRpcClient(),
    private workerId = `worker-${randomBytes(4).toString("hex")}`,
  ) {}

  async enqueue<N extends JobName>(
    name: N,
    payload: JobPayloadMap[N],
    opts?: { idempotencyKey?: string; delayMs?: number; maxAttempts?: number },
  ): Promise<EnqueueResult> {
    if (!isKnownJobName(name)) {
      throw new Error(`Unknown job type: ${name}`);
    }
    assertJobPayloadHasOrgId(payload);
    const { data, error } = await this.client.rpc("enqueue_durable_job", {
      p_name: name,
      p_payload: payload,
      p_idempotency_key: opts?.idempotencyKey ?? null,
      p_delay_ms: opts?.delayMs ?? 0,
      p_max_attempts: opts?.maxAttempts ?? 5,
    });
    if (error) throw new Error(error.message);
    const result = data as { jobId?: string; duplicate?: boolean };
    if (!result?.jobId) throw new Error("enqueue_durable_job returned no jobId");
    return {
      jobId: String(result.jobId),
      duplicate: Boolean(result.duplicate),
    };
  }

  async claimDue(limit = 10, workerId?: string): Promise<DurableJob[]> {
    const { data, error } = await this.client.rpc("claim_durable_jobs", {
      p_limit: limit,
      p_worker_id: workerId ?? this.workerId,
      p_lease_seconds: Number(process.env.WORKER_LEASE_SECONDS ?? 300),
    });
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((r) => mapClaimedJob(r as Record<string, unknown>));
  }

  async complete(jobId: string): Promise<void> {
    const { error } = await this.client.rpc("complete_durable_job", {
      p_job_id: jobId,
    });
    if (error) throw new Error(error.message);
  }

  async fail(
    jobId: string,
    errorMessage: string,
    opts?: FailJobOptions,
  ): Promise<void> {
    const { error } = await this.client.rpc("fail_durable_job", {
      p_job_id: jobId,
      p_error: sanitizeJobError(errorMessage),
      p_retry_delay_ms:
        opts?.deadLetter || opts?.retryDelayMs == null
          ? null
          : opts.retryDelayMs,
      p_dead_letter: Boolean(opts?.deadLetter),
    });
    if (error) throw new Error(error.message);
  }

  async recoverStale(leaseSeconds = 300): Promise<number> {
    const { data, error } = await this.client.rpc("recover_stale_durable_jobs", {
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(error.message);
    const recovered = (data as { recovered?: number } | null)?.recovered ?? 0;
    return Number(recovered);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const { data, error } = await this.client.rpc(
      "count_durable_jobs_by_status",
      {},
    );
    if (error) throw new Error(error.message);
    return (data as Record<string, number>) ?? {};
  }
}

const globalQueue = globalThis as typeof globalThis & {
  __leadorbitJobQueue?: DurableJobQueue;
  __leadorbitJobQueueMode?: string;
};

/**
 * Mode-aware queue. Supabase mode never falls back to SQLite.
 */
export function getJobQueue(): DurableJobQueue {
  const mode = getAuthMode();
  if (
    globalQueue.__leadorbitJobQueue &&
    globalQueue.__leadorbitJobQueueMode === mode
  ) {
    return globalQueue.__leadorbitJobQueue;
  }
  if (mode === "supabase") {
    globalQueue.__leadorbitJobQueue = new PostgresJobQueue();
  } else {
    globalQueue.__leadorbitJobQueue = new SqliteJobQueue(getCrmDatabase());
  }
  globalQueue.__leadorbitJobQueueMode = mode;
  return globalQueue.__leadorbitJobQueue;
}

export function resetJobQueueForTests(): void {
  delete globalQueue.__leadorbitJobQueue;
  delete globalQueue.__leadorbitJobQueueMode;
}

/** Test seam for PostgresJobQueue with mocked RPC client. */
export function createPostgresJobQueueForTests(
  client: RpcClient,
  workerId?: string,
): PostgresJobQueue {
  return new PostgresJobQueue(client, workerId);
}
