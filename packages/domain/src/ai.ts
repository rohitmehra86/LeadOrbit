/**
 * Milestone 7 — AI sales/qualification agents + provider-agnostic LLM gateway.
 * Consequential actions require auth; never invent pricing/availability/commitments.
 */

export type AiProviderStatus =
  | "ready"
  | "unverified"
  | "pending_configuration";

export type VectorBackendStatus =
  | "pgvector"
  | "local_fallback"
  | "pending_configuration";

export type AiAgentKind =
  | "inbound_enquiry"
  | "requirement_extraction"
  | "qualification"
  | "product_qa"
  | "recommendations"
  | "next_actions"
  | "appointment_hooks"
  | "conversation_summary"
  | "handoff_summary"
  | "follow_up_draft"
  | "multilingual";

export type AiToolName =
  | "retrieve_knowledge"
  | "lookup_inventory"
  | "extract_requirements"
  | "score_lead"
  | "draft_reply"
  | "summarize_conversation"
  | "propose_appointment"
  | "escalate_to_human"
  | "update_lead_fields"
  | "send_authorized_message";

/** Tools that mutate CRM/messaging state and require write-level auth. */
export const CONSEQUENTIAL_AI_TOOLS: readonly AiToolName[] = [
  "propose_appointment",
  "update_lead_fields",
  "send_authorized_message",
] as const;

export type AiChannel =
  | "website_chat"
  | "whatsapp"
  | "email"
  | "sms"
  | "messenger"
  | "instagram"
  | "inbox"
  | "api";

export interface AiPersona {
  id: string;
  orgId: string;
  name: string;
  kind: AiAgentKind;
  systemPrompt: string;
  locale: string;
  tone: string;
  allowedTools: AiToolName[];
  allowedChannels: AiChannel[];
  policies: AiPolicies;
  handoffRules: AiHandoffRules;
  knowledgeCollectionIds: string[];
  promptVersion: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiPolicies {
  /** Never invent prices, availability, or contractual commitments. */
  neverInventPricing: boolean;
  neverInventAvailability: boolean;
  requireAuthForConsequential: boolean;
  allowMultilingual: boolean;
  maxTokensPerTurn: number;
  temperature: number;
}

export interface AiHandoffRules {
  escalateOnBudgetMissing: boolean;
  escalateOnLowConfidence: boolean;
  confidenceThreshold: number;
  escalateKeywords: string[];
  alwaysEscalateTools: AiToolName[];
}

export interface AiPromptVersion {
  id: string;
  orgId: string;
  personaId: string;
  version: number;
  systemPrompt: string;
  note: string | null;
  createdAt: string;
}

export interface AiUsageEvent {
  id: string;
  orgId: string;
  personaId: string | null;
  provider: string;
  model: string;
  status: AiProviderStatus;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  toolCalls: number;
  latencyMs: number;
  createdAt: string;
}

export interface AiEvalCase {
  id: string;
  orgId: string;
  personaId: string | null;
  name: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  lastScore: number | null;
  lastRanAt: string | null;
  createdAt: string;
}

export interface QualificationSignals {
  budget: string | null;
  location: string | null;
  timeline: string | null;
  productInterest: string | null;
  intent: "high" | "medium" | "low" | "unknown";
  missingFields: string[];
  score: number;
  rationale: string[];
}

export interface AiTurnResult {
  status: AiProviderStatus;
  reply: string;
  language: string;
  qualification: QualificationSignals;
  recommendations: string[];
  nextActions: string[];
  sources: Array<{ documentId: string; chunkId: string; title: string; score: number }>;
  toolCalls: Array<{ tool: AiToolName; ok: boolean; detail: string; authorized: boolean }>;
  escalated: boolean;
  escalationReason: string | null;
  summary: string | null;
  handoffSummary: string | null;
  followUpDraft: string | null;
  usage: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number | null;
  };
  warnings: string[];
}

export interface LlmChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface LlmStructuredRequest {
  messages: LlmChatMessage[];
  /** JSON schema name for structured outputs (OpenAI-compatible). */
  schemaName?: string;
  schema?: Record<string, unknown>;
  tools?: Array<{ name: AiToolName; description: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmStructuredResponse {
  status: AiProviderStatus;
  provider: string;
  model: string;
  content: string | null;
  structured: Record<string, unknown> | null;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  detail: string;
}

export const DEFAULT_AI_POLICIES: AiPolicies = {
  neverInventPricing: true,
  neverInventAvailability: true,
  requireAuthForConsequential: true,
  allowMultilingual: true,
  maxTokensPerTurn: 1024,
  temperature: 0.2,
};

export const DEFAULT_HANDOFF_RULES: AiHandoffRules = {
  escalateOnBudgetMissing: true,
  escalateOnLowConfidence: true,
  confidenceThreshold: 0.45,
  escalateKeywords: ["speak to human", "manager", "complaint", "lawyer", "refund"],
  alwaysEscalateTools: ["send_authorized_message", "update_lead_fields"],
};

export function llmCredentialsPresent(): boolean {
  return Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
}

export function embeddingCredentialsPresent(): boolean {
  return Boolean(
    process.env.EMBEDDING_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.LLM_API_KEY,
  );
}

export function llmGatewayStatus(): AiProviderStatus {
  return llmCredentialsPresent() ? "unverified" : "pending_configuration";
}

export function vectorBackendStatus(): VectorBackendStatus {
  if (process.env.DATABASE_URL && process.env.PGVECTOR_ENABLED === "true") {
    return "pgvector";
  }
  return "local_fallback";
}

export function isConsequentialTool(tool: AiToolName): boolean {
  return (CONSEQUENTIAL_AI_TOOLS as readonly string[]).includes(tool);
}

/** Deterministic requirement extraction — no LLM required. */
export function extractRequirementsDeterministic(text: string): {
  budget: string | null;
  location: string | null;
  timeline: string | null;
  productInterest: string | null;
  language: string;
} {
  const lower = text.toLowerCase();
  const budgetMatch =
    text.match(/(?:budget|price|under|upto|up to)\s*[:\-]?\s*([$₹€£]?\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m|lakh|cr)?)/i) ||
    text.match(/([$₹€£]\s?\d[\d,]*(?:\.\d+)?)/);
  const locationMatch =
    text.match(/(?:in|near|at|location|city)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/) ||
    text.match(/\b(mumbai|delhi|bangalore|bengaluru|hyderabad|pune|chennai|london|dubai|singapore|new york)\b/i);
  const timelineMatch =
    text.match(/(?:within|by|in)\s+(\d+\s*(?:days?|weeks?|months?|years?))|asap|immediately|this (?:week|month|quarter)/i);
  const productMatch =
    text.match(/(?:looking for|interested in|need|want)\s+([a-z0-9 \-]{3,40})/i);

  let language = "en";
  if (/[\u0900-\u097F]/.test(text)) language = "hi";
  else if (/[\u0600-\u06FF]/.test(text)) language = "ar";
  else if (/[ñáéíóúü¿¡]/i.test(text) && /\b(hola|gracias|precio)\b/i.test(lower))
    language = "es";

  return {
    budget: budgetMatch?.[1]?.trim() ?? null,
    location: locationMatch?.[1]?.trim() ?? null,
    timeline: timelineMatch?.[0]?.trim() ?? null,
    productInterest: productMatch?.[1]?.trim() ?? null,
    language,
  };
}

/** Deterministic qualification + score (budget/location/timeline). */
export function qualifyLeadDeterministic(input: {
  text: string;
  budget?: string | null;
  location?: string | null;
  timeline?: string | null;
  productInterest?: string | null;
}): QualificationSignals {
  const extracted = extractRequirementsDeterministic(input.text);
  const budget = input.budget ?? extracted.budget;
  const location = input.location ?? extracted.location;
  const timeline = input.timeline ?? extracted.timeline;
  const productInterest = input.productInterest ?? extracted.productInterest;

  const missing: string[] = [];
  if (!budget) missing.push("budget");
  if (!location) missing.push("location");
  if (!timeline) missing.push("timeline");

  let score = 20;
  const rationale: string[] = [];
  if (budget) {
    score += 30;
    rationale.push("Budget signal present");
  } else rationale.push("Budget missing");
  if (location) {
    score += 20;
    rationale.push("Location signal present");
  } else rationale.push("Location missing");
  if (timeline) {
    score += 20;
    rationale.push("Timeline signal present");
  } else rationale.push("Timeline missing");
  if (productInterest) {
    score += 10;
    rationale.push("Product interest noted");
  }

  let intent: QualificationSignals["intent"] = "unknown";
  if (score >= 70) intent = "high";
  else if (score >= 45) intent = "medium";
  else if (score >= 25) intent = "low";

  return {
    budget,
    location,
    timeline,
    productInterest,
    intent,
    missingFields: missing,
    score: Math.min(100, score),
    rationale,
  };
}

export function shouldEscalateToHuman(input: {
  text: string;
  qualification: QualificationSignals;
  rules: AiHandoffRules;
  confidence?: number;
}): { escalate: boolean; reason: string | null } {
  const lower = input.text.toLowerCase();
  for (const kw of input.rules.escalateKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { escalate: true, reason: `Keyword: ${kw}` };
    }
  }
  if (
    input.rules.escalateOnBudgetMissing &&
    input.qualification.missingFields.includes("budget") &&
    input.qualification.intent !== "unknown"
  ) {
    // Only escalate when engagement is present but budget still missing after signals
  }
  if (
    input.rules.escalateOnLowConfidence &&
    typeof input.confidence === "number" &&
    input.confidence < input.rules.confidenceThreshold
  ) {
    return { escalate: true, reason: "Low confidence" };
  }
  if (/\b(human|agent|representative|manager)\b/i.test(input.text)) {
    return { escalate: true, reason: "User requested human" };
  }
  return { escalate: false, reason: null };
}

/**
 * Safe reply scaffold — refuses invented pricing/availability.
 * Inventory facts must be injected by the caller from SQL.
 */
export function buildGroundedReply(input: {
  qualification: QualificationSignals;
  inventoryFacts: Array<{ name: string; price: number | null; availability: string | null }>;
  knowledgeSnippets: string[];
  locale?: string;
  escalated?: boolean;
}): string {
  const parts: string[] = [];
  parts.push("Thanks for reaching out — I can help qualify your enquiry.");
  if (input.qualification.productInterest) {
    parts.push(`I noted interest in: ${input.qualification.productInterest}.`);
  }
  if (input.inventoryFacts.length > 0) {
    const lines = input.inventoryFacts.map((f) => {
      const price =
        f.price == null
          ? "price on request (not listed)"
          : `listed price ${f.price}`;
      const avail = f.availability ?? "availability not listed";
      return `• ${f.name}: ${price}; ${avail}`;
    });
    parts.push("From our catalog (authoritative inventory):\n" + lines.join("\n"));
  } else {
    parts.push(
      "I do not have authoritative pricing/availability for that item yet — I will not invent figures. A teammate can confirm.",
    );
  }
  if (input.knowledgeSnippets.length > 0) {
    parts.push("From knowledge base:\n" + input.knowledgeSnippets.slice(0, 2).join("\n"));
  }
  if (input.qualification.missingFields.length > 0) {
    parts.push(
      `To qualify further, could you share: ${input.qualification.missingFields.join(", ")}?`,
    );
  }
  if (input.escalated) {
    parts.push("I am connecting you with a human specialist for the next step.");
  }
  if (input.locale && input.locale !== "en") {
    parts.push(`(Multilingual scaffolding: detected/requested locale ${input.locale}.)`);
  }
  return parts.join("\n\n");
}

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  usdPer1k = 0.002,
): number {
  return Number((((promptTokens + completionTokens) / 1000) * usdPer1k).toFixed(6));
}

export function defaultPersonaSeed(
  orgId: string,
  now: string,
): Omit<AiPersona, "id"> {
  return {
    orgId,
    name: "Sales qualifier",
    kind: "qualification",
    systemPrompt:
      "You are LeadOrbit's sales qualification assistant. Never invent pricing, availability, or commitments. Use only retrieved knowledge and SQL inventory. Escalate when unsure or when the user asks for a human.",
    locale: "en",
    tone: "concise-helpful",
    allowedTools: [
      "retrieve_knowledge",
      "lookup_inventory",
      "extract_requirements",
      "score_lead",
      "draft_reply",
      "summarize_conversation",
      "propose_appointment",
      "escalate_to_human",
    ],
    allowedChannels: ["website_chat", "inbox", "api", "email", "whatsapp"],
    policies: { ...DEFAULT_AI_POLICIES },
    handoffRules: { ...DEFAULT_HANDOFF_RULES },
    knowledgeCollectionIds: [],
    promptVersion: 1,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}
