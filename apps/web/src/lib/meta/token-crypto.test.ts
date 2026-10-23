import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "./token-crypto";

describe("meta token crypto", () => {
  it("round-trips secrets", () => {
    const cipher = encryptSecret("meta-access-token-value");
    assert.notEqual(cipher, "meta-access-token-value");
    assert.equal(decryptSecret(cipher), "meta-access-token-value");
  });
});
