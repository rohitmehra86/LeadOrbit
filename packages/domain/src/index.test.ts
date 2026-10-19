import assert from "node:assert/strict";
import { test } from "node:test";
import { canManageMembers, clampLeadScore, normalizePhone } from "./index.js";

test("clampLeadScore bounds values", () => {
  assert.equal(clampLeadScore(-5), 0);
  assert.equal(clampLeadScore(150), 100);
  assert.equal(clampLeadScore(42.6), 43);
});

test("canManageMembers allows admin+", () => {
  assert.equal(canManageMembers("admin"), true);
  assert.equal(canManageMembers("agent"), false);
});

test("normalizePhone strips formatting", () => {
  assert.equal(normalizePhone("+91 98765-43210"), "+919876543210");
});
