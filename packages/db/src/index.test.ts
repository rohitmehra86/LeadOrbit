import assert from "node:assert/strict";
import { test } from "node:test";
import { NotConfiguredError, StubOrganizationRepository } from "./index.js";

test("stub org repo signals missing Supabase config", async () => {
  const repo = new StubOrganizationRepository();
  await assert.rejects(() => repo.listForUser("user"), NotConfiguredError);
});
