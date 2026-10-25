import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicRecordId } from "./public-record-id";

test("public landing ids accept the demo org uuid and reject path junk", () => {
  assert.equal(
    isPublicRecordId("33333333-3333-4333-8333-333333333333"),
    true,
  );
  assert.equal(isPublicRecordId("not-a-uuid"), false);
  assert.equal(isPublicRecordId(""), false);
  assert.equal(
    isPublicRecordId("33333333-3333-4333-8333-333333333333' or 1=1"),
    false,
  );
});
