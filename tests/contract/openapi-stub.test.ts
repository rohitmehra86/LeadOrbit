import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("OpenAPI partner surface declares health, orgs, webhooks, marketplace", () => {
  const yaml = readFileSync(
    resolve(process.cwd(), "packages/api-contracts/openapi/openapi.yaml"),
    "utf8",
  );
  assert.match(yaml, /openapi: 3\.1\.0/);
  assert.match(yaml, /\/health:/);
  assert.match(yaml, /\/orgs:/);
  assert.match(yaml, /\/orgs\/\{orgId\}\/partner-webhooks:/);
  assert.match(yaml, /\/public\/partners\/\{orgId\}\/webhooks:/);
  assert.match(yaml, /\/orgs\/\{orgId\}\/marketplace:/);
  assert.match(yaml, /PartnerEventType/);
  assert.match(yaml, /lead\.created/);
});
