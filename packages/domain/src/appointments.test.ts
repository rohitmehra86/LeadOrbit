import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBuffers,
  authorizeCalendarProvider,
  computeEndIso,
  intervalsOverlap,
} from "./appointments";

test("intervalsOverlap detects conflict", () => {
  const a0 = new Date("2026-10-20T10:00:00.000Z");
  const a1 = new Date("2026-10-20T10:30:00.000Z");
  const b0 = new Date("2026-10-20T10:15:00.000Z");
  const b1 = new Date("2026-10-20T10:45:00.000Z");
  assert.equal(intervalsOverlap(a0, a1, b0, b1), true);
  assert.equal(
    intervalsOverlap(
      a0,
      a1,
      new Date("2026-10-20T10:30:00.000Z"),
      new Date("2026-10-20T11:00:00.000Z"),
    ),
    false,
  );
});

test("buffers expand blocked window", () => {
  const { blockedStart, blockedEnd } = applyBuffers(
    "2026-10-20T10:00:00.000Z",
    "2026-10-20T10:30:00.000Z",
    10,
    15,
  );
  assert.equal(blockedStart.toISOString(), "2026-10-20T09:50:00.000Z");
  assert.equal(blockedEnd.toISOString(), "2026-10-20T10:45:00.000Z");
});

test("computeEndIso adds duration", () => {
  assert.equal(
    computeEndIso("2026-10-20T10:00:00.000Z", 45),
    "2026-10-20T10:45:00.000Z",
  );
});

test("calendar OAuth without credentials is pending", () => {
  const prevG = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  try {
    const g = authorizeCalendarProvider("google");
    assert.equal(g.status, "pending_configuration");
  } finally {
    if (prevG) process.env.GOOGLE_CALENDAR_CLIENT_ID = prevG;
  }
});
