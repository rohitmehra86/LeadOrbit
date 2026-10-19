/**
 * Legacy in-memory queue kept for unit tests of the JobQueue port shape.
 * Production/local durable path is SqliteJobQueue in @leadorbit/db.
 */
export {
  InMemoryJobQueue,
  type JobQueue,
  type JobHandler,
} from "./memory-queue";
