import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csrfOriginAllowed,
  evaluateRateLimit,
  isSafeRedirectPath,
  isValidEmail,
  sanitizePlainText,
  validateStructuredOutput,
} from "./security";

test("rate limit blocks after window fills", () => {
  const now = 1_000_000;
  const ok = evaluateRateLimit({
    hits: [now - 100, now - 50],
    nowMs: now,
    windowMs: 1000,
    limit: 3,
  });
  assert.equal(ok.allowed, true);
  assert.equal(ok.remaining, 0);

  const blocked = evaluateRateLimit({
    hits: [now - 100, now - 50, now - 10],
    nowMs: now,
    windowMs: 1000,
    limit: 3,
  });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test("csrf origin allowlist", () => {
  assert.equal(
    csrfOriginAllowed({
      origin: "http://127.0.0.1:43127",
      referer: null,
      allowedOrigins: ["http://127.0.0.1:43127"],
    }).ok,
    true,
  );
  assert.equal(
    csrfOriginAllowed({
      origin: "https://evil.example",
      referer: null,
      allowedOrigins: ["http://127.0.0.1:43127"],
    }).ok,
    false,
  );
  assert.equal(
    csrfOriginAllowed({
      origin: null,
      referer: null,
      allowedOrigins: ["http://127.0.0.1:43127"],
      allowMissing: false,
    }).ok,
    false,
  );
});

test("structured output validation", () => {
  const schema = {
    type: "object",
    required: ["intent", "confidence"],
    properties: {
      intent: { type: "string", enum: ["buy", "rent", "unknown"] },
      confidence: { type: "number" },
    },
  };
  const ok = validateStructuredOutput(
    { intent: "buy", confidence: 0.9 },
    schema,
  );
  assert.equal(ok.ok, true);
  const bad = validateStructuredOutput({ intent: "lease" }, schema);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("confidence")));
  assert.ok(bad.errors.some((e) => e.includes("enum")));
});

test("sanitize and email/redirect helpers", () => {
  assert.equal(sanitizePlainText("  hi\u0000there  ", 5), "hithe");
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("nope"), false);
  assert.equal(isSafeRedirectPath("/app/orgs/1"), true);
  assert.equal(isSafeRedirectPath("//evil.com"), false);
});
