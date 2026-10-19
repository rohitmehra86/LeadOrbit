import { InMemoryJobQueue } from "./queue";

const queue = new InMemoryJobQueue();

queue.register("lead.score", async (payload) => {
  // Milestone 7 will call scoring services. M1 only proves the port wiring.
  console.log(`[worker] lead.score org=${payload.orgId} lead=${payload.leadId}`);
});

queue.register("workflow.run_step", async (payload) => {
  console.log(
    `[worker] workflow.run_step org=${payload.orgId} enrollment=${payload.enrollmentId}`,
  );
});

await queue.start();
console.log("[worker] LeadOrbit worker listening (in-memory queue — not production durable)");

const shutdown = async () => {
  await queue.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

// Keep process alive
await new Promise(() => {});
