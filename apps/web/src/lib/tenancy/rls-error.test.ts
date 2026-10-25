import assert from "node:assert/strict";
import test from "node:test";
import { isRlsPermissionError } from "./rls-error";

test("detects anon row-security denials", () => {
  assert.equal(
    isRlsPermissionError({ message: "permission denied for function is_org_member", code: "42501" }),
    true,
  );
  assert.equal(
    isRlsPermissionError({ message: "new row violates row-level security policy for table leads" }),
    true,
  );
  assert.equal(isRlsPermissionError({ message: "form not found or not published", code: "P0002" }), false);
  assert.equal(isRlsPermissionError(null), false);
});
