import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  buildGroundedReply,
  callLlmStructured,
  DEFAULT_AI_POLICIES,
  DEFAULT_HANDOFF_RULES,
  defaultPersonaSeed,
  describeLlmGateway,
  estimateCostUsd,
  estimateTokenCount,
  extractRequirementsDeterministic,
  hasPermission,
  isConsequentialTool,
  qualifyLeadDeterministic,
  shouldEscalateToHuman,
  type AiChannel,
  type AiEvalCase,
  type AiPersona,
  type AiPolicies,
  type AiHandoffRules,
  type AiPromptVersion,
  type AiToolName,
  type AiTurnResult,
  type AiUsageEvent,
  type AiAgentKind,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import { KnowledgeStore } from "./knowledge-store";
import { SqliteJobQueue } from "./job-queue";

function nowIso(): string {
  return new Date().toISOString();
}

function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class AiStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private knowledge: KnowledgeStore,
    private queue: SqliteJobQueue = new SqliteJobQueue(db),
  ) {}

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "ai:read" | "ai:write" | "ai:run",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  gatewayInfo() {
    return {
      ...describeLlmGateway(),
      vectorBackend: this.knowledge.backendStatus(),
    };
  }

  private mapPersona(r: Record<string, unknown>): AiPersona {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      kind: r.kind as AiAgentKind,
      systemPrompt: String(r.system_prompt),
      locale: String(r.locale),
      tone: String(r.tone),
      allowedTools: jparse(String(r.allowed_tools), [] as AiToolName[]),
      allowedChannels: jparse(String(r.allowed_channels), [] as AiChannel[]),
      policies: {
        ...DEFAULT_AI_POLICIES,
        ...jparse(String(r.policies), {}),
      },
      handoffRules: {
        ...DEFAULT_HANDOFF_RULES,
        ...jparse(String(r.handoff_rules), {}),
      },
      knowledgeCollectionIds: jparse(String(r.knowledge_collection_ids), []),
      promptVersion: Number(r.prompt_version),
      enabled: Boolean(r.enabled),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async ensureDefaultPersona(actor: SessionUser, orgId: string): Promise<AiPersona> {
    await this.gate(actor, orgId, "ai:write");
    const existing = this.db
      .prepare(`select * from ai_personas where org_id=? order by created_at limit 1`)
      .get(orgId) as Record<string, unknown> | undefined;
    if (existing) return this.mapPersona(existing);
    return this.createPersona(actor, orgId, {});
  }

  async createPersona(
    actor: SessionUser,
    orgId: string,
    input: Partial<{
      name: string;
      kind: AiAgentKind;
      systemPrompt: string;
      locale: string;
      tone: string;
      allowedTools: AiToolName[];
      allowedChannels: AiChannel[];
      policies: Partial<AiPolicies>;
      handoffRules: Partial<AiHandoffRules>;
      knowledgeCollectionIds: string[];
    }>,
  ): Promise<AiPersona> {
    await this.gate(actor, orgId, "ai:write");
    const now = nowIso();
    const seed = defaultPersonaSeed(orgId, now);
    const id = randomUUID();
    const persona: AiPersona = {
      id,
      ...seed,
      name: input.name ?? seed.name,
      kind: input.kind ?? seed.kind,
      systemPrompt: input.systemPrompt ?? seed.systemPrompt,
      locale: input.locale ?? seed.locale,
      tone: input.tone ?? seed.tone,
      allowedTools: input.allowedTools ?? seed.allowedTools,
      allowedChannels: input.allowedChannels ?? seed.allowedChannels,
      policies: { ...seed.policies, ...input.policies },
      handoffRules: { ...seed.handoffRules, ...input.handoffRules },
      knowledgeCollectionIds:
        input.knowledgeCollectionIds ?? seed.knowledgeCollectionIds,
    };
    this.db
      .prepare(
        `insert into ai_personas(
          id, org_id, name, kind, system_prompt, locale, tone, allowed_tools, allowed_channels,
          policies, handoff_rules, knowledge_collection_ids, prompt_version, enabled, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        persona.id,
        orgId,
        persona.name,
        persona.kind,
        persona.systemPrompt,
        persona.locale,
        persona.tone,
        JSON.stringify(persona.allowedTools),
        JSON.stringify(persona.allowedChannels),
        JSON.stringify(persona.policies),
        JSON.stringify(persona.handoffRules),
        JSON.stringify(persona.knowledgeCollectionIds),
        persona.promptVersion,
        1,
        now,
        now,
      );
    this.db
      .prepare(
        `insert into ai_prompt_versions(id, org_id, persona_id, version, system_prompt, note, created_at)
         values (?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        orgId,
        id,
        1,
        persona.systemPrompt,
        "initial",
        now,
      );
    return persona;
  }

  async listPersonas(actor: SessionUser, orgId: string): Promise<AiPersona[]> {
    await this.gate(actor, orgId, "ai:read");
    const rows = this.db
      .prepare(`select * from ai_personas where org_id=? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapPersona(r));
  }

  async updatePersona(
    actor: SessionUser,
    orgId: string,
    personaId: string,
    patch: Partial<{
      name: string;
      systemPrompt: string;
      locale: string;
      tone: string;
      allowedTools: AiToolName[];
      allowedChannels: AiChannel[];
      policies: Partial<AiPolicies>;
      handoffRules: Partial<AiHandoffRules>;
      knowledgeCollectionIds: string[];
      enabled: boolean;
      bumpPromptVersion: boolean;
      promptNote: string | null;
    }>,
  ): Promise<AiPersona> {
    await this.gate(actor, orgId, "ai:write");
    const row = this.db
      .prepare(`select * from ai_personas where org_id=? and id=?`)
      .get(orgId, personaId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Persona not found", "not_found");
    const current = this.mapPersona(row);
    const nextPrompt = patch.systemPrompt ?? current.systemPrompt;
    const bump =
      patch.bumpPromptVersion ||
      (patch.systemPrompt != null && patch.systemPrompt !== current.systemPrompt);
    const nextVersion = bump ? current.promptVersion + 1 : current.promptVersion;
    const policies = { ...current.policies, ...patch.policies };
    const handoffRules = { ...current.handoffRules, ...patch.handoffRules };
    this.db
      .prepare(
        `update ai_personas set name=?, system_prompt=?, locale=?, tone=?, allowed_tools=?,
         allowed_channels=?, policies=?, handoff_rules=?, knowledge_collection_ids=?,
         prompt_version=?, enabled=?, updated_at=? where id=?`,
      )
      .run(
        patch.name ?? current.name,
        nextPrompt,
        patch.locale ?? current.locale,
        patch.tone ?? current.tone,
        JSON.stringify(patch.allowedTools ?? current.allowedTools),
        JSON.stringify(patch.allowedChannels ?? current.allowedChannels),
        JSON.stringify(policies),
        JSON.stringify(handoffRules),
        JSON.stringify(
          patch.knowledgeCollectionIds ?? current.knowledgeCollectionIds,
        ),
        nextVersion,
        patch.enabled == null ? (current.enabled ? 1 : 0) : patch.enabled ? 1 : 0,
        nowIso(),
        personaId,
      );
    if (bump) {
      this.db
        .prepare(
          `insert into ai_prompt_versions(id, org_id, persona_id, version, system_prompt, note, created_at)
           values (?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          orgId,
          personaId,
          nextVersion,
          nextPrompt,
          patch.promptNote ?? "updated",
          nowIso(),
        );
    }
    return this.mapPersona(
      this.db.prepare(`select * from ai_personas where id=?`).get(personaId) as Record<
        string,
        unknown
      >,
    );
  }

  async listPromptVersions(
    actor: SessionUser,
    orgId: string,
    personaId: string,
  ): Promise<AiPromptVersion[]> {
    await this.gate(actor, orgId, "ai:read");
    const rows = this.db
      .prepare(
        `select * from ai_prompt_versions where org_id=? and persona_id=? order by version desc`,
      )
      .all(orgId, personaId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      personaId: String(r.persona_id),
      version: Number(r.version),
      systemPrompt: String(r.system_prompt),
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at),
    }));
  }

  async listUsage(actor: SessionUser, orgId: string): Promise<AiUsageEvent[]> {
    await this.gate(actor, orgId, "ai:read");
    const rows = this.db
      .prepare(
        `select * from ai_usage_events where org_id=? order by created_at desc limit 100`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      personaId: r.persona_id ? String(r.persona_id) : null,
      provider: String(r.provider),
      model: String(r.model),
      status: r.status as AiUsageEvent["status"],
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      estimatedCostUsd:
        r.estimated_cost_usd == null ? null : Number(r.estimated_cost_usd),
      toolCalls: Number(r.tool_calls),
      latencyMs: Number(r.latency_ms),
      createdAt: String(r.created_at),
    }));
  }

  async createEval(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      personaId?: string | null;
      input: Record<string, unknown>;
      expected: Record<string, unknown>;
    },
  ): Promise<AiEvalCase> {
    await this.gate(actor, orgId, "ai:write");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into ai_evals(id, org_id, persona_id, name, input_json, expected_json, last_score, last_ran_at, created_at)
         values (?,?,?,?,?,?,null,null,?)`,
      )
      .run(
        id,
        orgId,
        input.personaId ?? null,
        input.name,
        JSON.stringify(input.input),
        JSON.stringify(input.expected),
        now,
      );
    return {
      id,
      orgId,
      personaId: input.personaId ?? null,
      name: input.name,
      input: input.input,
      expected: input.expected,
      lastScore: null,
      lastRanAt: null,
      createdAt: now,
    };
  }

  async listEvals(actor: SessionUser, orgId: string): Promise<AiEvalCase[]> {
    await this.gate(actor, orgId, "ai:read");
    const rows = this.db
      .prepare(`select * from ai_evals where org_id=? order by created_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      personaId: r.persona_id ? String(r.persona_id) : null,
      name: String(r.name),
      input: jparse(String(r.input_json), {}),
      expected: jparse(String(r.expected_json), {}),
      lastScore: r.last_score == null ? null : Number(r.last_score),
      lastRanAt: r.last_ran_at ? String(r.last_ran_at) : null,
      createdAt: String(r.created_at),
    }));
  }

  async runEval(
    actor: SessionUser,
    orgId: string,
    evalId: string,
  ): Promise<{ eval: AiEvalCase; result: AiTurnResult; pass: boolean }> {
    await this.gate(actor, orgId, "ai:run");
    const row = this.db
      .prepare(`select * from ai_evals where org_id=? and id=?`)
      .get(orgId, evalId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Eval not found", "not_found");
    const expected = jparse<Record<string, unknown>>(String(row.expected_json), {});
    const input = jparse<{ text?: string; channel?: AiChannel }>(
      String(row.input_json),
      {},
    );
    const result = await this.runTurn(actor, orgId, {
      text: String(input.text ?? ""),
      channel: (input.channel as AiChannel) ?? "api",
      personaId: row.persona_id ? String(row.persona_id) : undefined,
    });
    let score = 0;
    if (expected.requireNoInventedPrice) {
      score += /will not invent|listed price|price on request/i.test(result.reply)
        ? 0.5
        : 0;
    }
    if (typeof expected.minScore === "number") {
      score += result.qualification.score >= expected.minScore ? 0.5 : 0;
    }
    if (expected.mustEscalate) {
      score = result.escalated ? 1 : 0;
    }
    const pass = score >= 0.5;
    this.db
      .prepare(
        `update ai_evals set last_score=?, last_ran_at=? where id=?`,
      )
      .run(score, nowIso(), evalId);
    const updated = (await this.listEvals(actor, orgId)).find((e) => e.id === evalId)!;
    return { eval: updated, result, pass };
  }

  private recordUsage(
    orgId: string,
    personaId: string | null,
    usage: AiTurnResult["usage"] & { status: AiTurnResult["status"] },
    toolCalls: number,
    latencyMs: number,
  ): void {
    this.db
      .prepare(
        `insert into ai_usage_events(
          id, org_id, persona_id, provider, model, status, prompt_tokens, completion_tokens,
          estimated_cost_usd, tool_calls, latency_ms, created_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        orgId,
        personaId,
        usage.provider,
        usage.model,
        usage.status,
        usage.promptTokens,
        usage.completionTokens,
        usage.estimatedCostUsd,
        toolCalls,
        latencyMs,
        nowIso(),
      );
  }

  /**
   * Authorize a tool call. Consequential tools require ai:write (or crm/inbox write via role)
   * and persona allow-list. Never silently succeeds unauthorized tools.
   */
  private async authorizeTool(
    actor: SessionUser,
    orgId: string,
    persona: AiPersona,
    tool: AiToolName,
  ): Promise<{ authorized: boolean; detail: string }> {
    if (!persona.allowedTools.includes(tool)) {
      return { authorized: false, detail: "Tool not allowed on persona" };
    }
    if (isConsequentialTool(tool) && persona.policies.requireAuthForConsequential) {
      try {
        await this.gate(actor, orgId, "ai:write");
      } catch {
        return {
          authorized: false,
          detail: "Consequential tool requires ai:write authorization",
        };
      }
      // Also need domain write for CRM/messaging mutations
      if (tool === "update_lead_fields") {
        const m = await this.tenancy.getMembership(actor.id, orgId);
        if (
          !actor.isPlatformAdmin &&
          (!m || !hasPermission(m.role, "leads:write"))
        ) {
          return { authorized: false, detail: "Requires leads:write" };
        }
      }
      if (tool === "send_authorized_message") {
        const m = await this.tenancy.getMembership(actor.id, orgId);
        if (
          !actor.isPlatformAdmin &&
          (!m || !hasPermission(m.role, "inbox:write"))
        ) {
          return { authorized: false, detail: "Requires inbox:write" };
        }
      }
    }
    return { authorized: true, detail: "ok" };
  }

  async runTurn(
    actor: SessionUser,
    orgId: string,
    input: {
      text: string;
      channel?: AiChannel;
      personaId?: string;
      leadId?: string | null;
      conversationId?: string | null;
      locale?: string;
    },
  ): Promise<AiTurnResult> {
    await this.gate(actor, orgId, "ai:run");
    const started = Date.now();
    let persona: AiPersona;
    if (input.personaId) {
      const row = this.db
        .prepare(`select * from ai_personas where org_id=? and id=?`)
        .get(orgId, input.personaId) as Record<string, unknown> | undefined;
      if (!row) throw new AuthError("Persona not found", "not_found");
      persona = this.mapPersona(row);
    } else {
      const list = await this.listPersonas(actor, orgId);
      persona =
        list[0] ??
        (await this.createPersona(actor, orgId, {}));
    }
    if (!persona.enabled) {
      throw new AuthError("Persona disabled", "validation");
    }
    const channel = input.channel ?? "api";
    if (
      persona.allowedChannels.length &&
      !persona.allowedChannels.includes(channel)
    ) {
      throw new AuthError("Channel not allowed for persona", "forbidden");
    }

    const warnings: string[] = [];
    const toolCalls: AiTurnResult["toolCalls"] = [];

    // --- Deterministic core ---
    const extracted = extractRequirementsDeterministic(input.text);
    const qualification = qualifyLeadDeterministic({ text: input.text });
    const language = input.locale ?? extracted.language;

    // retrieve_knowledge
    let sources: AiTurnResult["sources"] = [];
    let knowledgeSnippets: string[] = [];
    {
      const auth = await this.authorizeTool(
        actor,
        orgId,
        persona,
        "retrieve_knowledge",
      );
      toolCalls.push({
        tool: "retrieve_knowledge",
        ok: auth.authorized,
        detail: auth.detail,
        authorized: auth.authorized,
      });
      if (auth.authorized) {
        const collectionId = persona.knowledgeCollectionIds[0];
        const { hits, backend } = await this.knowledge.retrieve(actor, orgId, {
          query: input.text,
          collectionId,
          limit: 4,
        });
        if (backend === "local_fallback") {
          warnings.push("Vector backend: local_fallback (pgvector not configured)");
        }
        sources = hits.map((h) => ({
          documentId: h.documentId,
          chunkId: h.chunkId,
          title: h.title,
          score: h.score,
        }));
        knowledgeSnippets = hits.map(
          (h) => `[${h.title}] ${h.content.slice(0, 280)}`,
        );
      }
    }

    // lookup_inventory (authoritative SQL)
    let inventoryFacts: Array<{
      name: string;
      price: number | null;
      availability: string | null;
    }> = [];
    {
      const auth = await this.authorizeTool(
        actor,
        orgId,
        persona,
        "lookup_inventory",
      );
      toolCalls.push({
        tool: "lookup_inventory",
        ok: auth.authorized,
        detail: auth.detail,
        authorized: auth.authorized,
      });
      if (auth.authorized) {
        const q =
          qualification.productInterest ||
          extracted.productInterest ||
          input.text.slice(0, 64);
        inventoryFacts = this.knowledge.lookupInventory(orgId, q).map((i) => ({
          name: i.name,
          price: i.price,
          availability: i.availability,
        }));
      }
    }

    {
      const auth = await this.authorizeTool(
        actor,
        orgId,
        persona,
        "extract_requirements",
      );
      toolCalls.push({
        tool: "extract_requirements",
        ok: auth.authorized,
        detail: auth.authorized ? "deterministic" : auth.detail,
        authorized: auth.authorized,
      });
    }
    {
      const auth = await this.authorizeTool(actor, orgId, persona, "score_lead");
      toolCalls.push({
        tool: "score_lead",
        ok: auth.authorized,
        detail: auth.authorized
          ? `score=${qualification.score}`
          : auth.detail,
        authorized: auth.authorized,
      });
    }

    const handoff = shouldEscalateToHuman({
      text: input.text,
      qualification,
      rules: persona.handoffRules,
      confidence: qualification.score / 100,
    });
    let escalated = handoff.escalate;
    let escalationReason = handoff.reason;

    // escalate_to_human tool
    {
      const auth = await this.authorizeTool(
        actor,
        orgId,
        persona,
        "escalate_to_human",
      );
      if (escalated) {
        toolCalls.push({
          tool: "escalate_to_human",
          ok: auth.authorized,
          detail: escalationReason ?? "escalated",
          authorized: auth.authorized,
        });
      }
    }

    // Consequential: propose_appointment — authorize only, do not book silently
    {
      const wantsAppt = /\b(book|schedule|appointment|demo|call)\b/i.test(
        input.text,
      );
      if (wantsAppt) {
        const auth = await this.authorizeTool(
          actor,
          orgId,
          persona,
          "propose_appointment",
        );
        toolCalls.push({
          tool: "propose_appointment",
          ok: auth.authorized,
          detail: auth.authorized
            ? "Appointment hook proposed — human confirmation required"
            : auth.detail,
          authorized: auth.authorized,
        });
        if (!auth.authorized) {
          escalated = true;
          escalationReason =
            escalationReason ?? "Appointment requires authorized human";
        }
      }
    }

    // update_lead_fields / send_authorized_message — never auto-run without auth
    for (const tool of [
      "update_lead_fields",
      "send_authorized_message",
    ] as AiToolName[]) {
      if (persona.allowedTools.includes(tool) && /please update|send message/i.test(input.text)) {
        const auth = await this.authorizeTool(actor, orgId, persona, tool);
        toolCalls.push({
          tool,
          ok: false,
          detail: auth.authorized
            ? "Authorized but not auto-executed — human confirmation required"
            : auth.detail,
          authorized: auth.authorized,
        });
        if (!auth.authorized) {
          escalated = true;
          escalationReason = escalationReason ?? auth.detail;
        }
      }
    }

    // Optional LLM enrichment — never required for deterministic path
    const llm = await callLlmStructured({
      messages: [
        { role: "system", content: persona.systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            text: input.text,
            qualification,
            inventoryFacts,
            knowledgeSnippets,
            instruction:
              "Return JSON with keys reply, summary, followUpDraft. Never invent prices.",
          }),
        },
      ],
      schemaName: "ai_turn",
      schema: {
        type: "object",
        properties: {
          reply: { type: "string" },
          summary: { type: "string" },
          followUpDraft: { type: "string" },
        },
        required: ["reply"],
        additionalProperties: false,
      },
      temperature: persona.policies.temperature,
      maxTokens: persona.policies.maxTokensPerTurn,
    });

    if (llm.status !== "ready") {
      warnings.push(`LLM ${llm.status}: ${llm.detail}`);
    }

    const grounded = buildGroundedReply({
      qualification,
      inventoryFacts,
      knowledgeSnippets,
      locale: language,
      escalated,
    });

    const llmReply =
      llm.status === "ready" && llm.structured?.reply
        ? String(llm.structured.reply)
        : llm.status === "ready" && llm.content
          ? llm.content
          : null;

    // Prefer grounded deterministic reply when inventory empty to enforce no invention;
    // if LLM ready, append only when it doesn't invent dollar amounts not in inventory.
    let reply = grounded;
    if (llmReply) {
      const invents =
        /\$\d|\₹\d|€\d|£\d/.test(llmReply) &&
        inventoryFacts.every((f) => f.price == null);
      if (invents) {
        warnings.push("LLM reply discarded — suspected invented pricing");
      } else {
        reply = `${grounded}\n\n---\nAssistant note:\n${llmReply}`;
      }
    }

    const summary =
      llm.status === "ready" && llm.structured?.summary
        ? String(llm.structured.summary)
        : `Enquiry score ${qualification.score}/100; intent ${qualification.intent}; missing ${qualification.missingFields.join(", ") || "none"}.`;

    const handoffSummary = escalated
      ? `HANDOFF: ${escalationReason ?? "policy"}. Qual=${JSON.stringify(qualification)}. Sources=${sources.length}.`
      : null;

    const followUpDraft =
      llm.status === "ready" && llm.structured?.followUpDraft
        ? String(llm.structured.followUpDraft)
        : qualification.missingFields.length
          ? `Hi — following up on your enquiry. Could you share your ${qualification.missingFields.join(" and ")} so we can recommend the right option?`
          : `Hi — thanks again. I can arrange a specialist call to discuss next steps.`;

    const recommendations: string[] = [];
    for (const item of inventoryFacts.slice(0, 3)) {
      recommendations.push(
        item.price == null
          ? `${item.name} (price on request; availability ${item.availability})`
          : `${item.name} at listed ${item.price} (${item.availability})`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        "No catalog match — gather requirements then escalate for curated options",
      );
    }

    const nextActions: string[] = [];
    if (qualification.missingFields.length) {
      nextActions.push(`Ask for ${qualification.missingFields.join(", ")}`);
    }
    if (escalated) nextActions.push("Route to human agent");
    else nextActions.push("Share catalog facts and propose appointment");
    nextActions.push("Log qualification score on lead");

    const promptTokens =
      llm.promptTokens || estimateTokenCount(input.text + persona.systemPrompt);
    const completionTokens =
      llm.completionTokens || estimateTokenCount(reply);
    const usage = {
      provider: llm.provider,
      model: llm.model,
      promptTokens,
      completionTokens,
      estimatedCostUsd:
        llm.estimatedCostUsd ??
        (llm.status === "ready"
          ? estimateCostUsd(promptTokens, completionTokens)
          : null),
    };

    const result: AiTurnResult = {
      status: llm.status,
      reply,
      language,
      qualification,
      recommendations,
      nextActions,
      sources,
      toolCalls,
      escalated,
      escalationReason,
      summary,
      handoffSummary,
      followUpDraft,
      usage,
      warnings,
    };

    this.recordUsage(
      orgId,
      persona.id,
      { ...usage, status: result.status },
      toolCalls.length,
      Date.now() - started,
    );

    const turnId = randomUUID();
    this.db
      .prepare(
        `insert into ai_turns(id, org_id, persona_id, channel, lead_id, conversation_id, user_text, result_json, status, created_at)
         values (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        turnId,
        orgId,
        persona.id,
        channel,
        input.leadId ?? null,
        input.conversationId ?? null,
        input.text,
        JSON.stringify(result),
        result.status,
        nowIso(),
      );

    // Optional durable queue marker (worker can re-process analytics later)
    this.queue.enqueue(
      "ai.run_turn",
      { orgId, turnId },
      { idempotencyKey: `ai-turn:${turnId}` },
    );

    return result;
  }

  async listTurns(
    actor: SessionUser,
    orgId: string,
  ): Promise<
    Array<{
      id: string;
      personaId: string | null;
      channel: string;
      userText: string;
      status: string;
      result: AiTurnResult;
      createdAt: string;
    }>
  > {
    await this.gate(actor, orgId, "ai:read");
    const rows = this.db
      .prepare(
        `select * from ai_turns where org_id=? order by created_at desc limit 50`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      personaId: r.persona_id ? String(r.persona_id) : null,
      channel: String(r.channel),
      userText: String(r.user_text),
      status: String(r.status),
      result: jparse(String(r.result_json), {} as AiTurnResult),
      createdAt: String(r.created_at),
    }));
  }
}
