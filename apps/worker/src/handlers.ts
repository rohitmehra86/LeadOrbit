import {
  isKnownJobName,
  type DurableJob,
} from "@leadorbit/db";

/** Handlers with real local SQLite domain implementations. */
export const IMPLEMENTED_LOCAL_HANDLERS = new Set([
  "workflow.tick",
  "workflow.run_step",
  "message.send",
  "knowledge.reindex",
  "embedding.upsert",
  "appointment.reminder",
  "voice.process",
  "partner.webhook.deliver",
]);

/**
 * Intentionally incomplete — must not be marked successful.
 * Follow-up: wire AI metering, scoring models, report email delivery,
 * and payment reconciliation (idempotent, no duplicate charges).
 */
export const UNSUPPORTED_HANDLERS = new Set([
  "ai.run_turn",
  "lead.score",
  "report.schedule",
  "payment.reconcile",
  "ads.sync",
]);

/**
 * In AUTH_MODE=supabase the durable queue is Postgres, but most domain
 * handlers still execute against SQLite stores. Until supabase domain
 * worker adapters exist, these must fail loudly (retry/dead-letter)
 * rather than silently succeed against empty local state.
 */
export const SUPABASE_DOMAIN_ADAPTER_PENDING = new Set([
  "workflow.tick",
  "workflow.run_step",
  "message.send",
  "knowledge.reindex",
  "embedding.upsert",
  "appointment.reminder",
  "voice.process",
  "partner.webhook.deliver",
]);

export class UnsupportedJobError extends Error {
  constructor(name: string, detail?: string) {
    super(
      detail
        ? `Handler not implemented for job type: ${name} (${detail})`
        : `Handler not implemented for job type: ${name}`,
    );
    this.name = "UnsupportedJobError";
  }
}

export function assertDispatchable(
  job: DurableJob,
  authMode: "local" | "supabase",
): void {
  if (!isKnownJobName(job.name)) {
    throw new UnsupportedJobError(job.name, "unknown job type");
  }
  if (UNSUPPORTED_HANDLERS.has(job.name)) {
    throw new UnsupportedJobError(
      job.name,
      "scaffolded only — real implementation pending",
    );
  }
  if (
    authMode === "supabase" &&
    SUPABASE_DOMAIN_ADAPTER_PENDING.has(job.name)
  ) {
    throw new UnsupportedJobError(
      job.name,
      "Postgres queue claim works; supabase domain worker adapter not yet wired",
    );
  }
}
