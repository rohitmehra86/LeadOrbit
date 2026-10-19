import { fromAuthError, jsonOk, requireUser } from "@/lib/api/http";
import { getJobQueue } from "@leadorbit/db";
import { createLogger } from "@leadorbit/observability";

const log = createLogger("ops-queue");

/**
 * Queue monitoring for platform admins. Scaffold for dashboards/alerts.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user.isPlatformAdmin) {
      return jsonOk({ error: "Platform admin required" }, { status: 403 });
    }
    const counts = getJobQueue().countByStatus();
    const dead = counts.dead_letter ?? 0;
    const pending = counts.pending ?? 0;
    log.info("queue snapshot", {
      pending,
      dead_letter: dead,
      running: counts.running ?? 0,
      completed: counts.completed ?? 0,
    });
    return jsonOk({
      status: "ok",
      counts,
      alerts: {
        deadLetterHigh: dead >= Number(process.env.QUEUE_DEAD_LETTER_ALERT ?? 10),
        pendingHigh: pending >= Number(process.env.QUEUE_PENDING_ALERT ?? 500),
      },
      detail:
        "In-process SQLite queue metrics — replace with managed worker metrics in production",
    });
  } catch (err) {
    return fromAuthError(err);
  }
}
