/**
 * AI ad-copy suggestions for Meta lead-gen launches.
 * Uses existing LLM gateway — never bypasses campaign validation.
 */

import { callLlmStructured, type LlmGatewayConfig } from "../llm-gateway";

export type MetaAdCopyBrief = {
  businessOrOffer: string;
  geo?: string | null;
  audienceBasics?: string | null;
  landingPageUrl?: string | null;
  tone?: string | null;
};

export type MetaAdCopySuggestion = {
  primaryText: string;
  headline: string;
  description: string;
  callToAction: "LEARN_MORE" | "SIGN_UP";
  creativeNotes: string[];
};

export type MetaAdCopyResult =
  | {
      status: "ready";
      suggestion: MetaAdCopySuggestion;
      detail: string;
      model: string;
    }
  | {
      status: "pending_configuration" | "unverified" | "error";
      suggestion: MetaAdCopySuggestion | null;
      detail: string;
      model: string;
    };

const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "primaryText",
    "headline",
    "description",
    "callToAction",
    "creativeNotes",
  ],
  properties: {
    primaryText: { type: "string" },
    headline: { type: "string" },
    description: { type: "string" },
    callToAction: { type: "string", enum: ["LEARN_MORE", "SIGN_UP"] },
    creativeNotes: { type: "array", items: { type: "string" } },
  },
} as const;

function fallbackSuggestion(brief: MetaAdCopyBrief): MetaAdCopySuggestion {
  const offer = brief.businessOrOffer.trim() || "your offer";
  const geo = brief.geo?.trim() || "your area";
  return {
    primaryText: `${offer}. Serving ${geo}. Share your details — we will follow up fast.`,
    headline: offer.length <= 40 ? offer : `${offer.slice(0, 37)}…`,
    description: `Learn more about ${offer} in ${geo}.`,
    callToAction: "SIGN_UP",
    creativeNotes: [
      "Template draft — edit before Approve",
      "LLM unavailable; this is a deterministic stub, not Meta-generated creative",
    ],
  };
}

function coerceSuggestion(
  structured: Record<string, unknown> | null,
  brief: MetaAdCopyBrief,
): MetaAdCopySuggestion {
  if (!structured) return fallbackSuggestion(brief);
  const ctaRaw = String(structured.callToAction ?? "SIGN_UP").toUpperCase();
  const callToAction: "LEARN_MORE" | "SIGN_UP" =
    ctaRaw === "LEARN_MORE" ? "LEARN_MORE" : "SIGN_UP";
  const notes = Array.isArray(structured.creativeNotes)
    ? structured.creativeNotes.map((n) => String(n)).filter(Boolean)
    : [];
  return {
    primaryText:
      String(structured.primaryText ?? "").trim() ||
      fallbackSuggestion(brief).primaryText,
    headline:
      String(structured.headline ?? "").trim() ||
      fallbackSuggestion(brief).headline,
    description: String(structured.description ?? "").trim(),
    callToAction,
    creativeNotes: notes.length
      ? notes
      : ["AI draft — review and edit before publication"],
  };
}

/**
 * Generate Meta ad copy via OpenAI-compatible LLM.
 * Missing keys → pending_configuration with optional template (never claimed as live AI).
 */
export async function suggestMetaAdCopy(
  brief: MetaAdCopyBrief,
  cfg?: LlmGatewayConfig,
): Promise<MetaAdCopyResult> {
  const offer = brief.businessOrOffer.trim();
  if (!offer) {
    return {
      status: "error",
      suggestion: null,
      detail: "businessOrOffer is required for AI copy",
      model: process.env.LLM_MODEL || "gpt-4o-mini",
    };
  }

  const res = await callLlmStructured(
    {
      messages: [
        {
          role: "system",
          content:
            "You write concise Meta lead-generation ad copy for real-estate and local services. Obey advertising policies. Do not invent claims, prices, or guarantees. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            businessOrOffer: offer,
            geo: brief.geo ?? null,
            audienceBasics: brief.audienceBasics ?? null,
            landingPageUrl: brief.landingPageUrl ?? null,
            tone: brief.tone ?? "professional and clear",
            constraints: {
              primaryTextMaxChars: 125,
              headlineMaxChars: 40,
              descriptionMaxChars: 30,
              callToAction: ["LEARN_MORE", "SIGN_UP"],
            },
          }),
        },
      ],
      schema: COPY_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "meta_ad_copy",
      temperature: 0.4,
      maxTokens: 600,
    },
    cfg,
  );

  if (res.status === "pending_configuration") {
    return {
      status: "pending_configuration",
      suggestion: fallbackSuggestion(brief),
      detail: res.detail,
      model: res.model,
    };
  }
  if (res.status !== "ready" || !res.structured) {
    return {
      status: "unverified",
      suggestion: fallbackSuggestion(brief),
      detail: res.detail || "LLM did not return structured copy",
      model: res.model,
    };
  }
  return {
    status: "ready",
    suggestion: coerceSuggestion(res.structured, brief),
    detail: "AI ad copy generated — edit before Approve",
    model: res.model,
  };
}
