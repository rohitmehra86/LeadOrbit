/**
 * Legacy in-memory queue kept for unit tests of the JobQueue port shape.
 * Durable path: SqliteJobQueue (local) or PostgresJobQueue (AUTH_MODE=supabase)
 * via getJobQueue() in @leadorbit/db.
 */
export {
  InMemoryJobQueue,
  type JobQueue,
  type JobHandler,
} from "./memory-queue";
