/**
 * Provider-agnostic OpenAI-compatible LLM gateway.
 * Without API keys: pending_configuration — never fake live model success.
 * With keys present but unverified against a live provider: unverified.
 */

import {
  estimateCostUsd,
  estimateTokenCount,
  llmCredentialsPresent,
  llmGatewayStatus,
  type LlmStructuredRequest,
  type LlmStructuredResponse,
} from "./ai";

export type LlmGatewayConfig = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Inject fetch for tests */
  fetchImpl?: typeof fetch;
};

function resolveConfig(cfg?: LlmGatewayConfig): {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  fetchImpl: typeof fetch;
} {
  return {
    baseUrl: (
      cfg?.baseUrl ||
      process.env.LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    apiKey:
      cfg?.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      null,
    model: cfg?.model || process.env.LLM_MODEL || "gpt-4o-mini",
    fetchImpl: cfg?.fetchImpl ?? fetch,
  };
}

/**
 * Call chat completions (structured / tools). Does not invent success without a key.
 * When a key is present we still mark status `unverified` unless a live HTTP 200
 * with choices is returned — then `ready` for that call only.
 */
export async function callLlmStructured(
  request: LlmStructuredRequest,
  cfg?: LlmGatewayConfig,
): Promise<LlmStructuredResponse> {
  const { baseUrl, apiKey, model, fetchImpl } = resolveConfig(cfg);
  const promptText = request.messages.map((m) => m.content).join("\n");
  const promptTokens = estimateTokenCount(promptText);

  if (!apiKey) {
    return {
      status: "pending_configuration",
      provider: "openai-compatible",
      model,
      content: null,
      structured: null,
      toolCalls: [],
      promptTokens,
      completionTokens: 0,
      estimatedCostUsd: null,
      detail: "LLM_API_KEY / OPENAI_API_KEY not configured",
    };
  }

  // Keys present: attempt live call. On network/HTTP failure → unverified (honest).
  try {
    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1024,
    };
    if (request.schema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: request.schemaName ?? "leadorbit",
          schema: request.schema,
          strict: true,
        },
      };
    }
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: { type: "object", properties: {}, additionalProperties: true },
        },
      }));
    }

    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return {
        status: "unverified",
        provider: "openai-compatible",
        model,
        content: null,
        structured: null,
        toolCalls: [],
        promptTokens,
        completionTokens: 0,
        estimatedCostUsd: null,
        detail: `Provider HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = json.choices?.[0]?.message;
    const content = message?.content ?? null;
    let structured: Record<string, unknown> | null = null;
    if (content) {
      try {
        structured = JSON.parse(content) as Record<string, unknown>;
      } catch {
        structured = null;
      }
    }
    const toolCalls =
      message?.tool_calls?.map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }
        return { name: tc.function?.name ?? "unknown", arguments: args };
      }) ?? [];

    const pTok = json.usage?.prompt_tokens ?? promptTokens;
    const cTok =
      json.usage?.completion_tokens ?? estimateTokenCount(content ?? "");
    return {
      status: "ready",
      provider: "openai-compatible",
      model,
      content,
      structured,
      toolCalls,
      promptTokens: pTok,
      completionTokens: cTok,
      estimatedCostUsd: estimateCostUsd(pTok, cTok),
      detail: "Live provider response",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    return {
      status: "unverified",
      provider: "openai-compatible",
      model,
      content: null,
      structured: null,
      toolCalls: [],
      promptTokens,
      completionTokens: 0,
      estimatedCostUsd: null,
      detail: message,
    };
  }
}

/** Convenience for health/status panels. */
export function describeLlmGateway(): {
  status: ReturnType<typeof llmGatewayStatus>;
  credentialsPresent: boolean;
  model: string;
} {
  return {
    status: llmGatewayStatus(),
    credentialsPresent: llmCredentialsPresent(),
    model: process.env.LLM_MODEL || "gpt-4o-mini",
  };
}
