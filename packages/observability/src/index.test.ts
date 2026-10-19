import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertingStatus,
  createLogger,
  errorMonitorStatus,
  otelStatus,
} from "./index";

test("error monitor pending without SENTRY_DSN", () => {
  const prev = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    assert.equal(errorMonitorStatus().status, "pending_configuration");
  } finally {
    if (prev) process.env.SENTRY_DSN = prev;
  }
});

test("otel pending without endpoint", () => {
  const prev = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  try {
    assert.equal(otelStatus().status, "pending_configuration");
  } finally {
    if (prev) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prev;
  }
});

test("alerting pending without webhook", () => {
  const prev = process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_WEBHOOK_URL;
  try {
    assert.equal(alertingStatus().status, "pending_configuration");
  } finally {
    if (prev) process.env.ALERT_WEBHOOK_URL = prev;
  }
});

test("logger emits without throwing", () => {
  const log = createLogger("test-service");
  assert.doesNotThrow(() => log.info("hello", { orgId: "o1" }));
});
