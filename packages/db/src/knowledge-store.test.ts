import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";
import { KnowledgeStore } from "./knowledge-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-kb-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const kb = new KnowledgeStore(tenancy, db, queue);
  return { tenancy, kb, queue, db };
}

test("cross-tenant knowledge retrieve forbidden", async () => {
  const { tenancy, kb } = setup();
  const alice = await tenancy.signUp({
    email: "a-kb@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "b-kb@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, { name: "Org A KB" });
  await tenancy.createOrganization(bob, { name: "Org B KB" });
  await kb.uploadDocument(alice, orgA.id, {
    title: "Secret FAQ",
    kind: "faq",
    rawText: "Tenant A confidential warranty terms for Product Alpha",
  });
  await assert.rejects(
    () => kb.listDocuments(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
  // Even with null actor path used internally, SQL org filter applies
  const { hits } = await kb.retrieve(null, orgA.id, { query: "warranty" });
  assert.ok(hits.every((h) => h.orgId === orgA.id));
});

test("upload index retrieve with local vector + inventory authority", async () => {
  const { tenancy, kb } = setup();
  const owner = await tenancy.signUp({
    email: "owner-kb@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "KB Co" });
  assert.equal(kb.backendStatus(), "local_fallback");

  const { document, warnings } = await kb.uploadDocument(owner, org.id, {
    title: "Solar FAQ",
    kind: "faq",
    rawText:
      "Our rooftop solar warranty covers inverters for 5 years. Installation takes 2 weeks.",
  });
  assert.equal(document.status, "indexed");
  assert.ok(Array.isArray(warnings));

  const { hits } = await kb.retrieve(owner, org.id, {
    query: "solar inverter warranty years",
  });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0]!.content.toLowerCase().includes("warranty"));

  await kb.upsertInventory(owner, org.id, {
    sku: "SOLAR-3KW",
    name: "Rooftop Solar 3kW",
    price: 2499,
    availability: "in_stock",
    category: "solar",
  });
  const items = kb.lookupInventory(org.id, "solar");
  assert.equal(items.length, 1);
  assert.equal(items[0]!.price, 2499);

  const quality = await kb.runRetrievalQuality(owner, org.id, [
    {
      query: "warranty inverter",
      expectedDocumentId: document.id,
      expectedSubstring: "5 years",
    },
  ]);
  assert.equal(quality[0]!.pass, true);

  await kb.deleteDocument(owner, org.id, document.id);
  const after = await kb.listDocuments(owner, org.id);
  assert.equal(after.length, 0);
});
