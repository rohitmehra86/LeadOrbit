/**
 * Milestone 7 — tenant-isolated knowledge / RAG.
 * Structured inventory & prices live in SQL as authoritative.
 */

export type KnowledgeDocKind =
  | "pdf"
  | "faq"
  | "catalog"
  | "brochure"
  | "text"
  | "url";

export type KnowledgeDocStatus =
  | "uploaded"
  | "parsing"
  | "indexed"
  | "failed"
  | "deleted";

export interface KnowledgeCollection {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  orgId: string;
  collectionId: string;
  title: string;
  kind: KnowledgeDocKind;
  status: KnowledgeDocStatus;
  version: number;
  sourcePath: string | null;
  mimeType: string | null;
  byteSize: number;
  metadata: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  orgId: string;
  documentId: string;
  collectionId: string;
  ordinal: number;
  content: string;
  /** Local fallback embedding (hashing trick). Null until indexed. */
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  orgId: string;
  sku: string;
  name: string;
  description: string | null;
  /** Authoritative list price — AI must not invent when null. */
  price: number | null;
  currency: string;
  availability: "in_stock" | "limited" | "out_of_stock" | "unknown";
  category: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  orgId: string;
  title: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RetrievalQualitySample {
  query: string;
  expectedDocumentId?: string;
  expectedSubstring?: string;
}

/** Simple whitespace tokenizer for local embeddings / chunking. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Deterministic local embedding (hashing trick) — honest local_fallback backend. */
export function localEmbed(text: string, dims = 64): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dims;
    const sign = h & 1 ? 1 : -1;
    vec[idx]! += sign;
  }
  // L2 normalize
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Chunk text into overlapping windows for indexing. */
export function chunkText(
  text: string,
  opts?: { size?: number; overlap?: number },
): string[] {
  const size = opts?.size ?? 500;
  const overlap = opts?.overlap ?? 80;
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= size) return [cleaned];
  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(cleaned.length, i + size);
    chunks.push(cleaned.slice(i, end));
    if (end >= cleaned.length) break;
    i = end - overlap;
  }
  return chunks;
}

/**
 * Minimal "parsing" for uploaded content.
 * PDF binary is not decoded here — store text extracts / FAQ markdown honestly.
 */
export function parseKnowledgeContent(input: {
  kind: KnowledgeDocKind;
  title: string;
  rawText: string;
  mimeType?: string | null;
}): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let text = input.rawText ?? "";
  if (input.kind === "pdf" && input.mimeType === "application/pdf") {
    if (!text.trim()) {
      warnings.push(
        "PDF binary parsing not available in local runtime — provide extracted text body.",
      );
    } else {
      warnings.push("Indexed provided text extract for PDF (no binary OCR claimed).");
    }
  }
  if (!text.trim()) {
    text = `${input.title}\n(Empty body — upload text extract to index.)`;
    warnings.push("Empty document body");
  }
  return { text, warnings };
}

export function scoreRetrievalQuality(
  hits: RetrievalHit[],
  sample: RetrievalQualitySample,
): { pass: boolean; score: number; detail: string } {
  if (hits.length === 0) {
    return { pass: false, score: 0, detail: "No hits" };
  }
  let score = hits[0]!.score;
  let pass = score >= 0.15;
  if (sample.expectedDocumentId) {
    const found = hits.some((h) => h.documentId === sample.expectedDocumentId);
    pass = pass && found;
    if (!found) return { pass: false, score, detail: "Expected document missing" };
  }
  if (sample.expectedSubstring) {
    const found = hits.some((h) =>
      h.content.toLowerCase().includes(sample.expectedSubstring!.toLowerCase()),
    );
    pass = pass && found;
    if (!found) return { pass: false, score, detail: "Expected substring missing" };
  }
  return { pass, score, detail: pass ? "ok" : "below threshold" };
}
