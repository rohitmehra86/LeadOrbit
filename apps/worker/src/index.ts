import {
  getCrmDatabase,
  getLocalTenancyStore,
  CalendarStore,
  CrmStore,
  InboxStore,
  KnowledgeStore,
  SqliteJobQueue,
  VoiceStore,
  WorkflowStore,
} from "@leadorbit/db";

/**
 * Durable worker process. Claims jobs from SQLite-backed queue and executes
 * workflow ticks, message sends, knowledge reindex, appointment reminders,
 * and voice post-processing. Must not run inside Vercel request handlers.
 */
const db = getCrmDatabase();
const tenancy = getLocalTenancyStore();
const queue = new SqliteJobQueue(db);
const crm = new CrmStore(tenancy, db);
const workflows = new WorkflowStore(tenancy, db, queue, crm);
const inbox = new InboxStore(tenancy, db, queue);
const knowledge = new KnowledgeStore(tenancy, db, queue);
const calendar = new CalendarStore(tenancy, db, queue);
const voice = new VoiceStore(tenancy, db, queue, calendar);

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);

async function drain(): Promise<void> {
  const jobs = queue.claimDue(20);
  for (const job of jobs) {
    try {
      if (job.name === "workflow.tick") {
        const p = job.payload as { orgId: string; enrollmentId: string };
        await workflows.processTick(p.orgId, p.enrollmentId);
      } else if (job.name === "message.send") {
        const p = job.payload as { orgId: string; messageId: string };
        inbox.processMessageSend(p.orgId, p.messageId);
      } else if (job.name === "workflow.run_step") {
        const p = job.payload as {
          orgId: string;
          enrollmentId: string;
          stepId: string;
        };
        await workflows.processTick(p.orgId, p.enrollmentId);
        void p.stepId;
      } else if (job.name === "knowledge.reindex") {
        const p = job.payload as { orgId: string; documentId: string };
        knowledge.indexDocument(p.orgId, p.documentId);
      } else if (job.name === "embedding.upsert") {
        const p = job.payload as {
          orgId: string;
          entityType: string;
          entityId: string;
        };
        if (p.entityType === "knowledge_document") {
          knowledge.indexDocument(p.orgId, p.entityId);
        }
      } else if (job.name === "appointment.reminder") {
        const p = job.payload as { orgId: string; reminderId: string };
        calendar.processReminder(p.orgId, p.reminderId);
      } else if (job.name === "voice.process") {
        const p = job.payload as { orgId: string; callId: string };
        voice.processCall(p.orgId, p.callId);
      } else if (job.name === "ai.run_turn") {
        console.log(`[worker] ai.run_turn ack`, job.payload);
      } else if (job.name === "lead.score") {
        console.log(`[worker] lead.score stub`, job.payload);
      } else {
        console.warn(`[worker] no handler for ${job.name}`);
      }
      queue.complete(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "job failed";
      console.error(`[worker] job ${job.id} failed`, message);
      const retry =
        job.attempts >= 3 ? { deadLetter: true as const } : { retryDelayMs: 5_000 };
      queue.fail(job.id, message, retry);
    }
  }
}

console.log(
  "[worker] LeadOrbit durable worker started (SQLite job queue — set LEADORBIT_SQLITE_PATH to share with web)",
);

const timer = setInterval(() => {
  void drain();
}, POLL_MS);

const shutdown = () => {
  clearInterval(timer);
  console.log("[worker] stopped");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
