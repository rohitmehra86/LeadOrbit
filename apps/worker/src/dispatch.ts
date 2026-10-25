import type { DurableJob } from "@leadorbit/db";
import {
  assertDispatchable,
  UnsupportedJobError,
} from "./handlers";

export type LocalDomainHandlers = {
  processWorkflowTick: (orgId: string, enrollmentId: string) => Promise<void>;
  processMessageSend: (orgId: string, messageId: string) => void;
  indexDocument: (orgId: string, documentId: string) => void;
  processReminder: (orgId: string, reminderId: string) => void;
  processCall: (orgId: string, callId: string) => void;
  processPartnerDelivery: (orgId: string, deliveryId: string) => Promise<void>;
};

export async function dispatchJob(
  job: DurableJob,
  authMode: "local" | "supabase",
  handlers: LocalDomainHandlers,
): Promise<void> {
  assertDispatchable(job, authMode);

  if (job.name === "workflow.tick") {
    const p = job.payload as { orgId: string; enrollmentId: string };
    await handlers.processWorkflowTick(p.orgId, p.enrollmentId);
    return;
  }
  if (job.name === "workflow.run_step") {
    const p = job.payload as {
      orgId: string;
      enrollmentId: string;
      stepId: string;
    };
    await handlers.processWorkflowTick(p.orgId, p.enrollmentId);
    void p.stepId;
    return;
  }
  if (job.name === "message.send") {
    const p = job.payload as { orgId: string; messageId: string };
    handlers.processMessageSend(p.orgId, p.messageId);
    return;
  }
  if (job.name === "knowledge.reindex") {
    const p = job.payload as { orgId: string; documentId: string };
    handlers.indexDocument(p.orgId, p.documentId);
    return;
  }
  if (job.name === "embedding.upsert") {
    const p = job.payload as {
      orgId: string;
      entityType: string;
      entityId: string;
    };
    if (p.entityType === "knowledge_document") {
      handlers.indexDocument(p.orgId, p.entityId);
    } else {
      throw new UnsupportedJobError(
        job.name,
        `unsupported entityType ${p.entityType}`,
      );
    }
    return;
  }
  if (job.name === "appointment.reminder") {
    const p = job.payload as { orgId: string; reminderId: string };
    handlers.processReminder(p.orgId, p.reminderId);
    return;
  }
  if (job.name === "voice.process") {
    const p = job.payload as { orgId: string; callId: string };
    handlers.processCall(p.orgId, p.callId);
    return;
  }
  if (job.name === "partner.webhook.deliver") {
    const p = job.payload as { orgId: string; deliveryId: string };
    await handlers.processPartnerDelivery(p.orgId, p.deliveryId);
    return;
  }

  throw new UnsupportedJobError(job.name);
}
