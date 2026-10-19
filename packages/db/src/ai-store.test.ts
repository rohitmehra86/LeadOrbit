import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";
import { KnowledgeStore } from "./knowledge-store";
import { AiStore } from "./ai-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-ai-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const queue = new SqliteJobQueue(db);
  const kb = new KnowledgeStore(tenancy, db, queue);
  const ai = new AiStore(tenancy, db, kb, queue);
  return { tenancy, kb, ai, queue };
}

test("viewer cannot run AI turns", async () => {
  const { tenancy, ai } = setup();
  const owner = await tenancy.signUp({
    email: "owner-ai@example.com",
    password: "password123",
  });
  const viewer = await tenancy.signUp({
    email: "viewer-ai@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "AI Co" });
  // invite viewer as viewer role via createMembership if available — use invite/accept pattern
  const invite = await tenancy.createInvite(
    owner,
    org.id,
    viewer.email,
    "viewer",
  );
  await tenancy.acceptInvite(viewer, invite.token!);

  await assert.rejects(
    () =>
      ai.runTurn(viewer, org.id, {
        text: "Looking for solar in Pune budget $5000",
      }),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("deterministic qualify + grounded reply without LLM keys", async () => {
  const prevLlm = process.env.LLM_API_KEY;
  const prevOai = process.env.OPENAI_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { tenancy, kb, ai } = setup();
    const owner = await tenancy.signUp({
      email: "owner-ai2@example.com",
      password: "password123",
    });
    const org = await tenancy.createOrganization(owner, { name: "AI Co 2" });
    await kb.uploadDocument(owner, org.id, {
      title: "Catalog FAQ",
      kind: "catalog",
      rawText: "Rooftop Solar 3kW kits include inverter. Warranty 5 years.",
    });
    await kb.upsertInventory(owner, org.id, {
      sku: "SOLAR-3KW",
      name: "Rooftop Solar 3kW",
      price: 2499,
      availability: "in_stock",
      category: "solar",
    });

    const persona = await ai.ensureDefaultPersona(owner, org.id);
    assert.ok(persona.policies.neverInventPricing);

    const turn = await ai.runTurn(owner, org.id, {
      text: "Looking for solar panel kit in Mumbai within 1 month, budget under $3000",
      channel: "website_chat",
      personaId: persona.id,
    });
    assert.equal(turn.status, "pending_configuration");
    assert.ok(turn.qualification.score >= 70);
    assert.match(turn.reply, /2499|listed price/i);
    assert.ok(turn.sources.length >= 0);
    assert.ok(turn.warnings.some((w) => /pending_configuration|local_fallback/i.test(w)));

    const usage = await ai.listUsage(owner, org.id);
    assert.ok(usage.length >= 1);
    assert.equal(usage[0]!.status, "pending_configuration");
  } finally {
    if (prevLlm) process.env.LLM_API_KEY = prevLlm;
    if (prevOai) process.env.OPENAI_API_KEY = prevOai;
  }
});

test("consequential send without inbox:write is denied for agents lacking write", async () => {
  const { tenancy, ai } = setup();
  const owner = await tenancy.signUp({
    email: "owner-ai3@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "AI Co 3" });
  const persona = await ai.createPersona(owner, org.id, {
    allowedTools: [
      "retrieve_knowledge",
      "lookup_inventory",
      "extract_requirements",
      "score_lead",
      "draft_reply",
      "send_authorized_message",
    ],
  });
  // Owner has inbox:write — tool authorized but not auto-executed
  const turn = await ai.runTurn(owner, org.id, {
    text: "Please send message confirming the deal price is $1",
    personaId: persona.id,
  });
  const sendTool = turn.toolCalls.find((t) => t.tool === "send_authorized_message");
  assert.ok(sendTool);
  assert.equal(sendTool!.authorized, true);
  assert.match(sendTool!.detail, /not auto-executed|confirmation/i);
  // Reply must not invent a commitment price from the user message alone when no inventory
  assert.match(turn.reply, /will not invent|not have authoritative/i);
});
