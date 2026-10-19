import assert from "node:assert/strict";
import { test } from "node:test";
import { problem } from "./index.js";

test("problem builds RFC7807-ish payload", () => {
  const p = problem(501, "Not Implemented", "Tenancy arrives in Milestone 2");
  assert.equal(p.status, 501);
  assert.match(p.type, /501$/);
});
