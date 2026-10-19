import { NextResponse } from "next/server";
import type { HealthResponse } from "@leadorbit/api-contracts";
import { API_VERSION } from "@leadorbit/api-contracts";
import { authStatus } from "@/lib/auth/session";
import {
  alertingStatus,
  createLogger,
  currentEnv,
  errorMonitorStatus,
  otelStatus,
} from "@leadorbit/observability";
import { getJobQueue } from "@leadorbit/db";

const log = createLogger("leadorbit-web");

export type OpsHealthResponse = HealthResponse & {
  env: string;
  queue?: Record<string, number>;
  monitors?: {
    errorTracking: ReturnType<typeof errorMonitorStatus>;
    otel: ReturnType<typeof otelStatus>;
    alerting: ReturnType<typeof alertingStatus>;
  };
};

export async function GET(request: Request) {
  const status = authStatus();
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";

  let queue: Record<string, number> | undefined;
  if (deep) {
    try {
      queue = getJobQueue().countByStatus();
    } catch (e) {
      log.warn("queue health probe failed", {
        detail: e instanceof Error ? e.message : "unknown",
      });
      queue = { error: 1 };
    }
  }

  const body: OpsHealthResponse = {
    status: "ok",
    service: "leadorbit-web",
    version: `0.12.0-${API_VERSION}`,
    timestamp: new Date().toISOString(),
    authMode: status.authMode,
    supabaseConfigured: status.supabaseConfigured,
    sessionSecretConfigured: status.sessionSecretConfigured,
    env: currentEnv(),
    ...(deep
      ? {
          queue,
          monitors: {
            errorTracking: errorMonitorStatus(),
            otel: otelStatus(),
            alerting: alertingStatus(),
          },
        }
      : {}),
  };
  return NextResponse.json(body);
}
