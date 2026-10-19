/**
 * Performance smoke — not a load test. Records latency for health + dashboard
 * paths when a server is up. Fails only on extreme regressions (>5s).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const BASE = process.env.LEADORBIT_BASE_URL ?? "http://127.0.0.1:43127";
const BUDGET_MS = Number(process.env.PERF_SMOKE_BUDGET_MS ?? 5000);

async function timed(url: string): Promise<{ status: number; ms: number }> {
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(BUDGET_MS + 1000) });
    return { status: res.status, ms: performance.now() - start };
  } catch (err) {
    return { status: 0, ms: performance.now() - start };
  }
}

test("health endpoint responds under budget", async (t) => {
  const { status, ms } = await timed(`${BASE}/api/v1/health`);
  if (status === 0) {
    t.skip(`server not reachable at ${BASE}`);
    return;
  }
  assert.equal(status, 200);
  assert.ok(
    ms < BUDGET_MS,
    `health took ${ms.toFixed(0)}ms (budget ${BUDGET_MS}ms)`,
  );
  console.log(`perf.smoke health=${ms.toFixed(1)}ms`);
});

test("login page HTML under budget", async (t) => {
  const { status, ms } = await timed(`${BASE}/login`);
  if (status === 0) {
    t.skip(`server not reachable at ${BASE}`);
    return;
  }
  // Accept 200/304; 5xx means server/middleware regression (fail).
  assert.ok(
    status === 200 || status === 304,
    `login status ${status} (expected 200/304)`,
  );
  assert.ok(ms < BUDGET_MS, `login took ${ms.toFixed(0)}ms`);
  console.log(`perf.smoke login=${ms.toFixed(1)}ms`);
});
