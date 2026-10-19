import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGroundedReply,
  extractRequirementsDeterministic,
  isConsequentialTool,
  llmGatewayStatus,
  qualifyLeadDeterministic,
  shouldEscalateToHuman,
  DEFAULT_HANDOFF_RULES,
} from "./ai";
import { callLlmStructured } from "./llm-gateway";

test("deterministic qualification extracts budget location timeline", () => {
  const q = qualifyLeadDeterministic({
    text: "Looking for a 2BHK in Mumbai within 2 months, budget under $120000",
  });
  assert.ok(q.budget);
  assert.ok(q.location);
  assert.ok(q.timeline);
  assert.equal(q.missingFields.length, 0);
  assert.ok(q.score >= 70);
});

test("grounded reply refuses invented pricing when inventory empty", () => {
  const q = qualifyLeadDeterministic({ text: "Need pricing for Model X" });
  const reply = buildGroundedReply({
    qualification: q,
    inventoryFacts: [],
    knowledgeSnippets: [],
  });
  assert.match(reply, /will not invent/i);
});

test("consequential tools flagged", () => {
  assert.equal(isConsequentialTool("send_authorized_message"), true);
  assert.equal(isConsequentialTool("retrieve_knowledge"), false);
});

test("handoff on human request", () => {
  const q = qualifyLeadDeterministic({ text: "hi" });
  const r = shouldEscalateToHuman({
    text: "Please connect me to a human agent",
    qualification: q,
    rules: DEFAULT_HANDOFF_RULES,
  });
  assert.equal(r.escalate, true);
});

test("LLM gateway without keys is pending_configuration — not fake ready", async () => {
  const prevLlm = process.env.LLM_API_KEY;
  const prevOai = process.env.OPENAI_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(llmGatewayStatus(), "pending_configuration");
    const res = await callLlmStructured({
      messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(res.status, "pending_configuration");
    assert.equal(res.content, null);
  } finally {
    if (prevLlm) process.env.LLM_API_KEY = prevLlm;
    if (prevOai) process.env.OPENAI_API_KEY = prevOai;
  }
});

test("extractRequirements detects hindi script as hi", () => {
  const r = extractRequirementsDeterministic("मुझे फ्लैट चाहिए in Pune");
  assert.equal(r.language, "hi");
});
