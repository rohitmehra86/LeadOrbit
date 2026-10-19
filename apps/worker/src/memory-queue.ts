import type { JobName, JobPayloadMap } from "@leadorbit/domain";

export type JobHandler<N extends JobName> = (
  payload: JobPayloadMap[N],
) => Promise<void>;

export interface JobQueue {
  enqueue<N extends JobName>(
    name: N,
    payload: JobPayloadMap[N],
    opts?: { idempotencyKey?: string; delayMs?: number },
  ): Promise<{ jobId: string }>;
  register<N extends JobName>(name: N, handler: JobHandler<N>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

type InternalJob = {
  id: string;
  name: JobName;
  payload: unknown;
  runAt: number;
};

/** Dev-only in-process queue (not durable across processes). */
export class InMemoryJobQueue implements JobQueue {
  private handlers = new Map<string, JobHandler<JobName>>();
  private jobs: InternalJob[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  async enqueue<N extends JobName>(
    name: N,
    payload: JobPayloadMap[N],
    opts?: { idempotencyKey?: string; delayMs?: number },
  ): Promise<{ jobId: string }> {
    const jobId = opts?.idempotencyKey ?? crypto.randomUUID();
    this.jobs.push({
      id: jobId,
      name,
      payload,
      runAt: Date.now() + (opts?.delayMs ?? 0),
    });
    return { jobId };
  }

  register<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.set(name, handler as JobHandler<JobName>);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.drain();
    }, 250);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    const now = Date.now();
    const ready = this.jobs.filter((j) => j.runAt <= now);
    this.jobs = this.jobs.filter((j) => j.runAt > now);
    for (const job of ready) {
      const handler = this.handlers.get(job.name);
      if (!handler) continue;
      try {
        await handler(job.payload as never);
      } catch (err) {
        console.error(`[worker] job ${job.id} failed`, err);
      }
    }
  }
}
