import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasPermission,
  permissionsForRole,
} from "../../packages/domain/src/permissions.ts";

test("role matrix: viewer < agent < manager < admin for key writes", () => {
  assert.equal(hasPermission("viewer", "leads:write"), false);
  assert.equal(hasPermission("agent", "leads:write"), true);
  assert.equal(hasPermission("manager", "campaigns:write"), true);
  assert.equal(hasPermission("admin", "org:billing"), true);
  assert.equal(hasPermission("manager", "org:billing"), false);
  assert.equal(hasPermission("viewer", "analytics:read"), true);
  assert.equal(hasPermission("viewer", "analytics:write"), false);
});

test("owner has every viewer permission", () => {
  for (const p of permissionsForRole("viewer")) {
    assert.equal(hasPermission("owner", p), true, `owner missing ${p}`);
  }
});
