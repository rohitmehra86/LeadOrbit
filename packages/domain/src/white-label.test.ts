import assert from "node:assert/strict";
import { test } from "node:test";
import { startDomainVerification, visibleFeatures } from "./white-label";

test("domain verification scaffolds TXT challenge", () => {
  const ok = startDomainVerification("crm.acme.example.com");
  assert.equal(ok.status, "scaffolded");
  assert.ok(ok.txtChallenge.startsWith("leadorbit-verify="));

  const bad = startDomainVerification("not a host");
  assert.equal(bad.status, "failed");
});

test("visibleFeatures lists enabled keys only", () => {
  assert.deepEqual(visibleFeatures({ a: true, b: false, c: true }).sort(), [
    "a",
    "c",
  ]);
  assert.deepEqual(visibleFeatures(null), []);
});
