import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunkText,
  cosineSimilarity,
  localEmbed,
  parseKnowledgeContent,
  scoreRetrievalQuality,
  type RetrievalHit,
} from "./knowledge";

test("local embeddings are normalized and similar for related text", () => {
  const a = localEmbed("solar panel installation guide rooftop");
  const b = localEmbed("rooftop solar panel install guide");
  const c = localEmbed("completely unrelated cooking recipes");
  assert.ok(Math.abs(a.reduce((s, v) => s + v * v, 0) - 1) < 1e-6);
  assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
});

test("chunkText overlaps windows", () => {
  const text = "x".repeat(1200);
  const chunks = chunkText(text, { size: 500, overlap: 80 });
  assert.ok(chunks.length >= 2);
});

test("pdf without extract warns honestly", () => {
  const parsed = parseKnowledgeContent({
    kind: "pdf",
    title: "Brochure",
    rawText: "",
    mimeType: "application/pdf",
  });
  assert.ok(parsed.warnings.some((w) => /PDF/i.test(w)));
});

test("retrieval quality sample checks substring", () => {
  const hits: RetrievalHit[] = [
    {
      chunkId: "c1",
      documentId: "d1",
      orgId: "o1",
      title: "FAQ",
      content: "Warranty covers 5 years on inverter",
      score: 0.8,
      metadata: {},
    },
  ];
  const ok = scoreRetrievalQuality(hits, {
    query: "warranty",
    expectedDocumentId: "d1",
    expectedSubstring: "5 years",
  });
  assert.equal(ok.pass, true);
  const bad = scoreRetrievalQuality(hits, {
    query: "warranty",
    expectedSubstring: "lifetime free",
  });
  assert.equal(bad.pass, false);
});
