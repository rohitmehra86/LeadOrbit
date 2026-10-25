import { hostname } from "node:os";
import {
  getAuthMode,
  getCrmDatabase,
  getJobQueue,
  getLocalTenancyStore,
  CalendarStore,
  CrmStore,
  InboxStore,
  KnowledgeStore,
  PartnerWebhookStore,
  SqliteJobQueue,
  VoiceStore,
  WorkflowStore,
  computeRetryDelayMs,
  sanitizeJobError,
  type DurableJobQueue,
} from "@leadorbit/db";
import { createLogger } from "@leadorbit/observability";
import { dispatchJob } from "./dispatch";
import { UnsupportedJobError } from "./handlers";
import { startWorkerHealthServer } from "./health";

/**
 * Durable worker process. Claims jobs from SQLite (local) or Postgres (supabase).
 * Must not run inside Vercel request handlers.
 */
const log = createLogger("leadorbit-worker");
startWorkerHealthServer();

const authMode = getAuthMode();
const workerId =
  process.env.WORKER_ID?.trim() ||
  `worker-${hostname()}-${process.pid}`;

let queue: DurableJobQueue;
try {
  queue = getJobQueue();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[worker] failed to initialize job queue: ${message}`);
  process.exit(1);
}

log.info("LeadOrbit durable worker started", {
  workerId,
  mode: authMode,
  queue: authMode === "supabase" ? "postgres" : "sqlite",
});

const db = getCrmDatabase();
const tenancy = getLocalTenancyStore();
const localQueue = new SqliteJobQueue(db);
const crm = new CrmStore(tenancy, db);
const workflows = new WorkflowStore(tenancy, db, localQueue, crm);
const inbox = new InboxStore(tenancy, db, localQueue);
const knowledge = new KnowledgeStore(tenancy, db, localQueue);
const calendar = new CalendarStore(tenancy, db, localQueue);
const voice = new VoiceStore(tenancy, db, localQueue, calendar);
const partnerWebhooks = new PartnerWebhookStore(tenancy, db, localQueue);

const domainHandlers = {
  processWorkflowTick: (orgId: string, enrollmentId: string) =>
    workflows.processTick(orgId, enrollmentId),
  processMessageSend: (orgId: string, messageId: string) =>
    inbox.processMessageSend(orgId, messageId),
  indexDocument: (orgId: string, documentId: string) =>
    knowledge.indexDocument(orgId, documentId),
  processReminder: (orgId: string, reminderId: string) =>
    calendar.processReminder(orgId, reminderId),
  processCall: (orgId: string, callId: string) =>
    voice.processCall(orgId, callId),
  processPartnerDelivery: async (orgId: string, deliveryId: string) => {
    await partnerWebhooks.processDelivery(orgId, deliveryId);
  },
};

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);
const LEASE_SECONDS = Number(process.env.WORKER_LEASE_SECONDS ?? 300);

let draining = false;
let stopping = false;

async function drain(): Promise<void> {
  if (draining || stopping) return;
  draining = true;
  try {
    if (typeof queue.recoverStale === "function") {
      await Promise.resolve(queue.recoverStale(LEASE_SECONDS));
    }
    const jobs = await Promise.resolve(queue.claimDue(20, workerId));
    for (const job of jobs) {
      if (stopping) break;
      try {
        await dispatchJob(job, authMode, domainHandlers);
        await Promise.resolve(queue.complete(job.id));
      } catch (err) {
        const message = sanitizeJobError(
          err instanceof Error ? err.message : "job failed",
        );
        const unsupported = err instanceof UnsupportedJobError;
        console.error(`[worker] job ${job.id} (${job.name}) failed`, message);
        if (unsupported || job.attempts >= job.maxAttempts) {
          await Promise.resolve(
            queue.fail(job.id, message, { deadLetter: true }),
          );
        } else {
          await Promise.resolve(
            queue.fail(job.id, message, {
              retryDelayMs: computeRetryDelayMs(job.attempts),
            }),
          );
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] drain loop error`, message);
    if (authMode === "supabase") {
      console.error(
        `[worker] PostgreSQL queue unavailable; refusing SQLite fallback`,
      );
    }
  } finally {
    draining = false;
  }
}

const timer = setInterval(() => {
  void drain();
}, POLL_MS);

const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const started = Date.now();
  while (draining && Date.now() - started < 10_000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log("[worker] stopped");
  process.exit(0);
};
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

await new Promise(() => {});
