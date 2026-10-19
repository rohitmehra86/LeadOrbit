import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SECURITY_HEADERS,
  csrfOriginAllowed,
  evaluateRateLimit,
} from "../../packages/domain/src/security.ts";

test("security headers include frame denial and nosniff", () => {
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.ok(SECURITY_HEADERS["Referrer-Policy"]);
});

test("csrf rejects evil origin", () => {
  const r = csrfOriginAllowed({
    origin: "https://evil.example",
    referer: null,
    allowedOrigins: ["http://127.0.0.1:43127"],
  });
  assert.equal(r.ok, false);
});

test("rate limit math returns retryAfter when exceeded", () => {
  const now = 5000;
  const r = evaluateRateLimit({
    hits: [4800, 4900, 4950],
    nowMs: now,
    windowMs: 1000,
    limit: 3,
  });
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfterMs >= 0);
});
