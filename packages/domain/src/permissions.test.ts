import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAssignRole,
  hasPermission,
  permissionsForRole,
} from "./permissions";

test("viewer cannot invite; manager can", () => {
  assert.equal(hasPermission("viewer", "members:invite"), false);
  assert.equal(hasPermission("manager", "members:invite"), true);
});

test("only owner/admin get branding:write", () => {
  assert.equal(hasPermission("manager", "branding:write"), false);
  assert.equal(hasPermission("admin", "branding:write"), true);
  assert.equal(hasPermission("owner", "branding:write"), true);
});

test("owner permissions are a superset of viewer", () => {
  const viewer = new Set(permissionsForRole("viewer"));
  for (const p of viewer) {
    assert.equal(hasPermission("owner", p), true, `owner missing ${p}`);
  }
});

test("admin cannot assign owner role", () => {
  assert.equal(canAssignRole("admin", "owner"), false);
  assert.equal(canAssignRole("owner", "admin"), true);
});
