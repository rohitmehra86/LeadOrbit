import { createServer } from "node:http";
import { getJobQueue } from "@leadorbit/db";
import {
  alertingStatus,
  createLogger,
  currentEnv,
  errorMonitorStatus,
  otelStatus,
} from "@leadorbit/observability";

const log = createLogger("leadorbit-worker");

/**
 * Lightweight HTTP health for worker platforms (Fly/Railway/Render).
 * Bind via WORKER_HEALTH_PORT (default 43128).
 */
export function startWorkerHealthServer(): void {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 43128);
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/health")) {
      let queue: Record<string, number> = {};
      try {
        queue = getJobQueue().countByStatus();
      } catch {
        queue = { error: 1 };
      }
      const body = {
        status: "ok",
        service: "leadorbit-worker",
        version: "0.12.0",
        env: currentEnv(),
        timestamp: new Date().toISOString(),
        queue,
        monitors: {
          errorTracking: errorMonitorStatus(),
          otel: otelStatus(),
          alerting: alertingStatus(),
        },
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.listen(port, "0.0.0.0", () => {
    log.info("worker health listening", { port });
  });
}
