import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("OpenAPI stub declares health and orgs paths", () => {
  const yaml = readFileSync(
    resolve(process.cwd(), "packages/api-contracts/openapi/openapi.yaml"),
    "utf8",
  );
  assert.match(yaml, /\/health:/);
  assert.match(yaml, /\/orgs:/);
  assert.match(yaml, /openapi: 3\.1\.0/);
});
