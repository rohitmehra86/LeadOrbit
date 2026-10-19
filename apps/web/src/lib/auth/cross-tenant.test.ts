import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthError, LocalTenancyStore } from "@leadorbit/db";

/**
 * Service-layer isolation tests (always runnable).
 * Postgres RLS verification remains blocked until a Supabase project is linked.
 */
test("API-equivalent: bob cannot read alice org via getOrganization", async () => {
  const store = new LocalTenancyStore();
  const alice = await store.signUp({
    email: "alice2@example.com",
    password: "password123",
  });
  const bob = await store.signUp({
    email: "bob2@example.com",
    password: "password123",
  });
  const orgA = await store.createOrganization(alice, { name: "Alice Org" });
  await store.createOrganization(bob, { name: "Bob Org" });


  await assert.rejects(
    () => store.getOrganization(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});
