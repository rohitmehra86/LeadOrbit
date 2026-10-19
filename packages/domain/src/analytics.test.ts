import assert from "node:assert/strict";
import { test } from "node:test";
import { metricFromCount, metricRatio, toCsv } from "./analytics";

test("metric distinguishes unavailable vs zero", () => {
  assert.equal(metricFromCount("x", "X", 0).availability, "zero");
  assert.equal(metricFromCount("x", "X", 3).availability, "ok");
  assert.equal(
    metricFromCount("x", "X", 0, { sourceAvailable: false }).availability,
    "unavailable",
  );
  assert.equal(metricRatio("r", "R", 0, 10).availability, "zero");
  assert.equal(metricRatio("r", "R", null, 10).availability, "unavailable");
});

test("toCsv escapes values", () => {
  const csv = toCsv([
    { name: 'Acme, "Inc"', count: 2 },
    { name: "Plain", count: 0 },
  ]);
  assert.match(csv, /"Acme, ""Inc"""/);
  assert.match(csv, /Plain,0/);
});
