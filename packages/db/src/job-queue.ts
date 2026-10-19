import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { JobName, JobPayloadMap } from "@leadorbit/domain";
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
  runAt: string;
  lastError: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * SQLite-backed durable job queue shared by apps/web (enqueue) and apps/worker (claim/run).
 * Replaces in-process memory for cross-process durability in local/dev.
 */
export class SqliteJobQueue {
  constructor(private db: DatabaseSync = getCrmDatabase()) {}

  enqueue<N extends JobName>(
    name: N,
    payload: JobPayloadMap[N],
    opts?: { idempotencyKey?: string; delayMs?: number },
  ): { jobId: string; duplicate: boolean } {
    const now = nowIso();
    const runAt = new Date(Date.now() + (opts?.delayMs ?? 0)).toISOString();
    const idem = opts?.idempotencyKey ?? null;
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
            id, name, payload, status, attempts, run_at, locked_at, idempotency_key, last_error, created_at, updated_at
          ) values (?,?,?,'pending',0,?,null,?,?,?,?)`,
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

  claimDue(limit = 10): DurableJob[] {
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
          `update durable_jobs set status='running', locked_at=?, attempts=attempts+1, updated_at=?
           where id=? and status='pending'`,
        )
        .run(now, now, String(row.id)) as { changes: number };
      if (updated.changes !== 1) continue;
      claimed.push({
        id: String(row.id),
        name: row.name as JobName,
        payload: JSON.parse(String(row.payload)) as JobPayloadMap[JobName],
        status: "running",
        attempts: Number(row.attempts) + 1,
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
        `update durable_jobs set status='completed', updated_at=?, locked_at=null where id=?`,
      )
      .run(now, jobId);
  }

  fail(
    jobId: string,
    error: string,
    opts?: { retryDelayMs?: number | null; deadLetter?: boolean },
  ): void {
    const now = nowIso();
    if (opts?.deadLetter || opts?.retryDelayMs == null) {
      this.db
        .prepare(
          `update durable_jobs set status='dead_letter', last_error=?, updated_at=?, locked_at=null where id=?`,
        )
        .run(error, now, jobId);
      return;
    }
    const runAt = new Date(Date.now() + opts.retryDelayMs).toISOString();
    this.db
      .prepare(
        `update durable_jobs set status='pending', last_error=?, run_at=?, updated_at=?, locked_at=null where id=?`,
      )
      .run(error, runAt, now, jobId);
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

export function getJobQueue(): SqliteJobQueue {
  return new SqliteJobQueue(getCrmDatabase());
}
