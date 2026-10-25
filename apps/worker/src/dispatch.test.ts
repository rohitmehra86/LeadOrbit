import assert from "node:assert/strict";
import { test } from "node:test";
import type { DurableJob } from "@leadorbit/db";
import { dispatchJob } from "./dispatch";
import { UnsupportedJobError } from "./handlers";

const ORG = "33333333-3333-4333-8333-333333333333";

function job(
  name: DurableJob["name"],
  payload: DurableJob["payload"],
): DurableJob {
  return {
    id: "job-1",
    name,
    payload,
    status: "running",
    attempts: 1,
    maxAttempts: 5,
    runAt: new Date().toISOString(),
    lastError: null,
  };
}

test("local mode runs implemented workflow.tick handler", async () => {
  let called = false;
  await dispatchJob(
    job("workflow.tick", {
      orgId: ORG,
      enrollmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }),
    "local",
    {
      processWorkflowTick: async () => {
        called = true;
      },
      processMessageSend: () => undefined,
      indexDocument: () => undefined,
      processReminder: () => undefined,
      processCall: () => undefined,
      processPartnerDelivery: async () => undefined,
    },
  );
  assert.equal(called, true);
});

test("unsupported handlers never complete successfully", async () => {
  await assert.rejects(
    () =>
      dispatchJob(
        job("payment.reconcile", {
          orgId: ORG,
          paymentIntentId: "pi_1",
        }),
        "local",
        {
          processWorkflowTick: async () => undefined,
          processMessageSend: () => undefined,
          indexDocument: () => undefined,
          processReminder: () => undefined,
          processCall: () => undefined,
          processPartnerDelivery: async () => undefined,
        },
      ),
    (err: unknown) => err instanceof UnsupportedJobError,
  );
});

test("unknown job types are rejected", async () => {
  await assert.rejects(
    () =>
      dispatchJob(
        {
          ...job("workflow.tick", {
            orgId: ORG,
            enrollmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          }),
          name: "totally.unknown" as DurableJob["name"],
        },
        "local",
        {
          processWorkflowTick: async () => undefined,
          processMessageSend: () => undefined,
          indexDocument: () => undefined,
          processReminder: () => undefined,
          processCall: () => undefined,
          processPartnerDelivery: async () => undefined,
        },
      ),
    /unknown job type|not implemented/i,
  );
});

test("supabase mode does not silently succeed domain handlers pending adapters", async () => {
  let called = false;
  await assert.rejects(
    () =>
      dispatchJob(
        job("workflow.tick", {
          orgId: ORG,
          enrollmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        }),
        "supabase",
        {
          processWorkflowTick: async () => {
            called = true;
          },
          processMessageSend: () => undefined,
          indexDocument: () => undefined,
          processReminder: () => undefined,
          processCall: () => undefined,
          processPartnerDelivery: async () => undefined,
        },
      ),
    /supabase domain worker adapter/i,
  );
  assert.equal(called, false);
});

test("handler failure propagates (caller must not mark complete)", async () => {
  await assert.rejects(
    () =>
      dispatchJob(
        job("message.send", { orgId: ORG, messageId: "m1" }),
        "local",
        {
          processWorkflowTick: async () => undefined,
          processMessageSend: () => {
            throw new Error("provider down");
          },
          indexDocument: () => undefined,
          processReminder: () => undefined,
          processCall: () => undefined,
          processPartnerDelivery: async () => undefined,
        },
      ),
    /provider down/,
  );
});
