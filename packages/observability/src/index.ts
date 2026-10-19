/**
 * Milestone 12 — observability scaffolding.
 * Structured logs, error-monitor hooks, OTEL stubs.
 * No fake "production monitoring live" claims without credentials.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface StructuredLogEvent {
  level: LogLevel;
  msg: string;
  service: string;
  env: string;
  ts: string;
  requestId?: string;
  orgId?: string;
  [key: string]: unknown;
}

export function currentEnv(): string {
  return (
    process.env.LEADORBIT_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function createLogger(service: string) {
  const env = currentEnv();
  function emit(level: LogLevel, msg: string, fields?: LogFields) {
    const event: StructuredLogEvent = {
      level,
      msg,
      service,
      env,
      ts: new Date().toISOString(),
      ...fields,
    };
    const line = JSON.stringify(event);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
  return {
    debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
    info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
    warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
    error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  };
}

export type ErrorMonitorStatus =
  | "ready"
  | "pending_configuration"
  | "disabled";

/** Sentry / error tracking hook — pending without DSN. */
export function errorMonitorStatus(): {
  status: ErrorMonitorStatus;
  detail: string;
  provider: "sentry" | "none";
} {
  if (process.env.SENTRY_DSN) {
    return {
      status: "ready",
      provider: "sentry",
      detail:
        "SENTRY_DSN present — SDK init still required in app entry (scaffold)",
    };
  }
  return {
    status: "pending_configuration",
    provider: "none",
    detail: "SENTRY_DSN not configured",
  };
}

export function captureException(
  err: unknown,
  context?: LogFields,
): { captured: boolean; detail: string } {
  const mon = errorMonitorStatus();
  const logger = createLogger("error-monitor");
  logger.error(err instanceof Error ? err.message : String(err), {
    ...context,
    stack: err instanceof Error ? err.stack?.slice(0, 500) : null,
    monitor: mon.status,
  });
  if (mon.status !== "ready") {
    return {
      captured: false,
      detail: mon.detail,
    };
  }
  // Live Sentry SDK not wired — do not claim delivery.
  return {
    captured: false,
    detail:
      "Sentry DSN set but SDK not initialized in this scaffold — log emitted only",
  };
}

export type OtelStatus = "ready" | "pending_configuration" | "disabled";

export function otelStatus(): {
  status: OtelStatus;
  detail: string;
} {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return {
      status: "ready",
      detail:
        "OTEL endpoint present — exporter wiring scaffolded, not verified live",
    };
  }
  return {
    status: "pending_configuration",
    detail: "OTEL_EXPORTER_OTLP_ENDPOINT not configured",
  };
}

/** Alerting webhook scaffold (PagerDuty/Slack/ops). */
export function alertingStatus(): {
  status: "ready" | "pending_configuration";
  detail: string;
} {
  if (process.env.ALERT_WEBHOOK_URL) {
    return {
      status: "ready",
      detail: "ALERT_WEBHOOK_URL set — delivery not verified in local runtime",
    };
  }
  return {
    status: "pending_configuration",
    detail: "ALERT_WEBHOOK_URL not configured",
  };
}

export async function postAlertScaffold(input: {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}): Promise<{ ok: boolean; detail: string }> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    return { ok: false, detail: "ALERT_WEBHOOK_URL not configured" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        severity: input.severity,
        title: input.title,
        detail: input.detail,
        env: currentEnv(),
        ts: new Date().toISOString(),
      }),
    });
    return {
      ok: res.ok,
      detail: res.ok ? "alert posted" : `alert HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "alert post failed",
    };
  }
}
