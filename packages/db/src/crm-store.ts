import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  computeSlaState,
  hasPermission,
  normalizeEmail,
  normalizePhoneCrm,
  pickAssignee,
  type Activity,
  type AssignmentRule,
  type AssignmentStrategy,
  type Company,
  type Contact,
  type CrmTask,
  type CustomFieldDef,
  type FollowUpReminder,
  type Lead,
  type LeadStatus,
  type Note,
  type Opportunity,
  type OwnershipHistoryEntry,
  type Pipeline,
  type PipelineStage,
  type SavedView,
  type Segment,
  type Tag,
  type AgentWorkload,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";

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

export class CrmStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
  ) {}

  registerOrg(orgId: string, name: string): void {
    this.db
      .prepare(
        `insert into crm_orgs(id, name) values (?, ?)
         on conflict(id) do update set name = excluded.name`,
      )
      .run(orgId, name);
    this.ensureDefaultPipelines(orgId);
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "crm:read" | "crm:write" | "crm:assign" | "crm:import" | "crm:merge",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  ensureDefaultPipelines(orgId: string): { lead: Pipeline; deal: Pipeline } {
    const existing = this.db
      .prepare(`select id, org_id, name, kind, is_default from pipelines where org_id = ?`)
      .all(orgId) as Array<{
      id: string;
      org_id: string;
      name: string;
      kind: "lead" | "deal";
      is_default: number;
    }>;
    let lead = existing.find((p) => p.kind === "lead");
    let deal = existing.find((p) => p.kind === "deal");
    if (!lead) {
      const id = randomUUID();
      this.db
        .prepare(
          `insert into pipelines(id, org_id, name, kind, is_default) values (?,?,?,?,1)`,
        )
        .run(id, orgId, "Lead pipeline", "lead");
      const stages = ["New", "Contacted", "Qualified", "Unqualified"];
      stages.forEach((name, i) => {
        this.db
          .prepare(
            `insert into pipeline_stages(id, org_id, pipeline_id, name, position, probability, is_won, is_lost)
             values (?,?,?,?,?,?,0,?)`,
          )
          .run(randomUUID(), orgId, id, name, i, i * 25, name === "Unqualified" ? 1 : 0);
      });
      lead = { id, org_id: orgId, name: "Lead pipeline", kind: "lead", is_default: 1 };
    }
    if (!deal) {
      const id = randomUUID();
      this.db
        .prepare(
          `insert into pipelines(id, org_id, name, kind, is_default) values (?,?,?,?,1)`,
        )
        .run(id, orgId, "Deal pipeline", "deal");
      const stages = [
        ["Discovery", 20, 0, 0],
        ["Proposal", 50, 0, 0],
        ["Negotiation", 75, 0, 0],
        ["Won", 100, 1, 0],
        ["Lost", 0, 0, 1],
      ] as const;
      stages.forEach(([name, prob, won, lost], i) => {
        this.db
          .prepare(
            `insert into pipeline_stages(id, org_id, pipeline_id, name, position, probability, is_won, is_lost)
             values (?,?,?,?,?,?,?,?)`,
          )
          .run(randomUUID(), orgId, id, name, i, prob, won, lost);
      });
      deal = { id, org_id: orgId, name: "Deal pipeline", kind: "deal", is_default: 1 };
    }
    return {
      lead: {
        id: lead.id,
        orgId,
        name: lead.name,
        kind: "lead",
        isDefault: true,
      },
      deal: {
        id: deal.id,
        orgId,
        name: deal.name,
        kind: "deal",
        isDefault: true,
      },
    };
  }

  listPipelines(actor: SessionUser, orgId: string): Promise<Pipeline[]> {
    return this.gate(actor, orgId, "crm:read").then(() => {
      const rows = this.db
        .prepare(`select * from pipelines where org_id = ?`)
        .all(orgId) as Array<{
        id: string;
        org_id: string;
        name: string;
        kind: "lead" | "deal";
        is_default: number;
      }>;
      return rows.map((r) => ({
        id: r.id,
        orgId: r.org_id,
        name: r.name,
        kind: r.kind,
        isDefault: Boolean(r.is_default),
      }));
    });
  }

  listStages(actor: SessionUser, orgId: string, pipelineId: string): Promise<PipelineStage[]> {
    return this.gate(actor, orgId, "crm:read").then(() => {
      const rows = this.db
        .prepare(
          `select * from pipeline_stages where org_id = ? and pipeline_id = ? order by position`,
        )
        .all(orgId, pipelineId) as Array<{
        id: string;
        org_id: string;
        pipeline_id: string;
        name: string;
        position: number;
        probability: number;
        is_won: number;
        is_lost: number;
      }>;
      return rows.map((r) => ({
        id: r.id,
        orgId: r.org_id,
        pipelineId: r.pipeline_id,
        name: r.name,
        position: r.position,
        probability: r.probability,
        isWon: Boolean(r.is_won),
        isLost: Boolean(r.is_lost),
      }));
    });
  }

  private mapLead(r: Record<string, unknown>): Lead {
    return {
      id: r.id as string,
      orgId: r.org_id as string,
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      fullName: r.full_name as string,
      companyId: (r.company_id as string) ?? null,
      contactId: (r.contact_id as string) ?? null,
      source: r.source as string,
      status: r.status as Lead["status"],
      lifecycleStage: r.lifecycle_stage as string,
      score: r.score as number,
      ownerUserId: (r.owner_user_id as string) ?? null,
      territory: (r.territory as string) ?? null,
      pipelineId: (r.pipeline_id as string) ?? null,
      stageId: (r.stage_id as string) ?? null,
      idempotencyKey: (r.idempotency_key as string) ?? null,
      customFields: jparse(r.custom_fields as string, {}),
      slaDueAt: (r.sla_due_at as string) ?? null,
      slaState: r.sla_state as Lead["slaState"],
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  async listLeads(
    actor: SessionUser,
    orgId: string,
    opts?: { ownerUserId?: string; status?: string; stageId?: string },
  ): Promise<Lead[]> {
    await this.gate(actor, orgId, "crm:read");
    let sql = `select * from leads where org_id = ?`;
    const params: unknown[] = [orgId];
    if (opts?.ownerUserId) {
      sql += ` and owner_user_id = ?`;
      params.push(opts.ownerUserId);
    }
    if (opts?.status) {
      sql += ` and status = ?`;
      params.push(opts.status);
    }
    if (opts?.stageId) {
      sql += ` and stage_id = ?`;
      params.push(opts.stageId);
    }
    sql += ` order by updated_at desc limit 500`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapLead(r));
  }

  async getLead(actor: SessionUser, orgId: string, leadId: string): Promise<Lead> {
    await this.gate(actor, orgId, "crm:read");
    const row = this.db
      .prepare(`select * from leads where id = ? and org_id = ?`)
      .get(leadId, orgId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Lead not found", "not_found");
    return this.mapLead(row);
  }

  private addActivity(
    orgId: string,
    actorUserId: string | null,
    entityType: string,
    entityId: string,
    activityType: string,
    summary: string,
    payload: Record<string, unknown> = {},
  ): void {
    this.db
      .prepare(
        `insert into activities(id, org_id, actor_user_id, entity_type, entity_id, activity_type, summary, payload, created_at)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        orgId,
        actorUserId,
        entityType,
        entityId,
        activityType,
        summary,
        JSON.stringify(payload),
        nowIso(),
      );
  }

  private recordOwnership(
    orgId: string,
    entityType: "lead" | "opportunity",
    entityId: string,
    fromUserId: string | null,
    toUserId: string | null,
    reason: string,
    changedByUserId: string,
  ): void {
    this.db
      .prepare(
        `insert into ownership_history(id, org_id, entity_type, entity_id, from_user_id, to_user_id, reason, changed_by_user_id, created_at)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        orgId,
        entityType,
        entityId,
        fromUserId,
        toUserId,
        reason,
        changedByUserId,
        nowIso(),
      );
  }

  async createLead(
    actor: SessionUser,
    orgId: string,
    input: {
      fullName: string;
      email?: string | null;
      phone?: string | null;
      source?: string;
      territory?: string | null;
      ownerUserId?: string | null;
      idempotencyKey?: string | null;
      customFields?: Record<string, unknown>;
      assignStrategy?: AssignmentStrategy;
      slaHours?: number;
    },
  ): Promise<Lead> {
    await this.gate(actor, orgId, "crm:write");
    if (input.idempotencyKey) {
      const existing = this.db
        .prepare(`select * from leads where org_id = ? and idempotency_key = ?`)
        .get(orgId, input.idempotencyKey) as Record<string, unknown> | undefined;
      if (existing) return this.mapLead(existing);
    }

    const pipelines = this.ensureDefaultPipelines(orgId);
    const stages = await this.listStages(actor, orgId, pipelines.lead.id);
    const firstStage = stages[0];
    const ts = nowIso();
    const slaDueAt =
      input.slaHours != null
        ? new Date(Date.now() + input.slaHours * 3600 * 1000).toISOString()
        : new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    let ownerUserId = input.ownerUserId ?? null;
    let assignReason = "manual";
    if (input.assignStrategy && input.assignStrategy !== "manual") {
      await this.gate(actor, orgId, "crm:assign");
      const rule = await this.getActiveAssignmentRule(orgId, input.assignStrategy);
      const agents = await this.getAgentWorkloads(orgId);
      const pick = pickAssignee({
        strategy: input.assignStrategy,
        agents,
        lead: {
          territory: input.territory,
          source: input.source ?? "manual",
          email: input.email,
        },
        ruleConfig: rule?.config ?? {},
        manualUserId: input.ownerUserId,
      });
      ownerUserId = pick.userId;
      assignReason = pick.reason;
      if (rule && pick.nextCursor != null) {
        const cfg = { ...rule.config, roundRobinCursor: pick.nextCursor };
        this.db
          .prepare(`update assignment_rules set config = ? where id = ? and org_id = ?`)
          .run(JSON.stringify(cfg), rule.id, orgId);
      }
    }

    const id = randomUUID();
    this.db
      .prepare(
        `insert into leads(
          id, org_id, email, phone, full_name, company_id, contact_id, source, status,
          lifecycle_stage, score, owner_user_id, territory, pipeline_id, stage_id,
          idempotency_key, custom_fields, sla_due_at, sla_state, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        normalizeEmail(input.email),
        normalizePhoneCrm(input.phone),
        input.fullName.trim(),
        null,
        null,
        input.source ?? "manual",
        "new",
        "lead",
        0,
        ownerUserId,
        input.territory ?? null,
        pipelines.lead.id,
        firstStage?.id ?? null,
        input.idempotencyKey ?? null,
        JSON.stringify(input.customFields ?? {}),
        slaDueAt,
        computeSlaState(slaDueAt),
        ts,
        ts,
      );

    if (ownerUserId) {
      this.recordOwnership(orgId, "lead", id, null, ownerUserId, assignReason, actor.id);
    }
    this.addActivity(orgId, actor.id, "lead", id, "lead.created", `Lead created: ${input.fullName}`, {
      source: input.source ?? "manual",
      ownerUserId,
      assignReason,
    });
    return this.getLead(actor, orgId, id);
  }

  async updateLeadScore(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    score: number,
    status?: LeadStatus,
  ): Promise<Lead> {
    await this.gate(actor, orgId, "crm:write");
    await this.getLead(actor, orgId, leadId);
    const ts = nowIso();
    const nextScore = Math.max(0, Math.min(100, Math.round(score)));
    if (status) {
      this.db
        .prepare(
          `update leads set score = ?, status = ?, updated_at = ? where id = ? and org_id = ?`,
        )
        .run(nextScore, status, ts, leadId, orgId);
    } else {
      this.db
        .prepare(`update leads set score = ?, updated_at = ? where id = ? and org_id = ?`)
        .run(nextScore, ts, leadId, orgId);
    }
    this.addActivity(orgId, actor.id, "lead", leadId, "lead.scored", `Score → ${nextScore}`, {
      score: nextScore,
      status: status ?? null,
    });
    return this.getLead(actor, orgId, leadId);
  }

  async updateLeadStage(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    stageId: string,
  ): Promise<Lead> {
    await this.gate(actor, orgId, "crm:write");
    const lead = await this.getLead(actor, orgId, leadId);
    const stage = this.db
      .prepare(`select * from pipeline_stages where id = ? and org_id = ?`)
      .get(stageId, orgId) as { id: string; name: string } | undefined;
    if (!stage) throw new AuthError("Stage not found", "not_found");
    const ts = nowIso();
    this.db
      .prepare(`update leads set stage_id = ?, updated_at = ?, status = ? where id = ? and org_id = ?`)
      .run(
        stageId,
        ts,
        stage.name.toLowerCase().includes("unqual") ? "unqualified" : lead.status,
        leadId,
        orgId,
      );
    this.addActivity(orgId, actor.id, "lead", leadId, "lead.stage_changed", `Stage → ${stage.name}`, {
      from: lead.stageId,
      to: stageId,
    });
    return this.getLead(actor, orgId, leadId);
  }

  async assignLead(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    toUserId: string | null,
    reason = "manual_reassign",
  ): Promise<Lead> {
    await this.gate(actor, orgId, "crm:assign");
    const lead = await this.getLead(actor, orgId, leadId);
    const ts = nowIso();
    this.db
      .prepare(`update leads set owner_user_id = ?, updated_at = ? where id = ? and org_id = ?`)
      .run(toUserId, ts, leadId, orgId);
    this.recordOwnership(
      orgId,
      "lead",
      leadId,
      lead.ownerUserId,
      toUserId,
      reason,
      actor.id,
    );
    this.addActivity(orgId, actor.id, "lead", leadId, "lead.assigned", "Lead reassigned", {
      from: lead.ownerUserId,
      to: toUserId,
      reason,
    });
    return this.getLead(actor, orgId, leadId);
  }

  async autoAssignLead(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    strategy: AssignmentStrategy,
  ): Promise<Lead> {
    await this.gate(actor, orgId, "crm:assign");
    const lead = await this.getLead(actor, orgId, leadId);
    const rule = await this.getActiveAssignmentRule(orgId, strategy);
    const agents = await this.getAgentWorkloads(orgId);
    const pick = pickAssignee({
      strategy,
      agents,
      lead,
      ruleConfig: rule?.config ?? {},
    });
    if (rule && pick.nextCursor != null) {
      this.db
        .prepare(`update assignment_rules set config = ? where id = ? and org_id = ?`)
        .run(JSON.stringify({ ...rule.config, roundRobinCursor: pick.nextCursor }), rule.id, orgId);
    }
    return this.assignLead(actor, orgId, leadId, pick.userId, pick.reason);
  }

  async escalateOverdueLeads(actor: SessionUser, orgId: string): Promise<number> {
    await this.gate(actor, orgId, "crm:assign");
    const rows = this.db
      .prepare(
        `select * from leads where org_id = ? and sla_due_at is not null and sla_state != 'escalated'`,
      )
      .all(orgId) as Array<Record<string, unknown>>;
    let count = 0;
    for (const row of rows) {
      const lead = this.mapLead(row);
      const state = computeSlaState(lead.slaDueAt);
      if (state === "breached") {
        this.db
          .prepare(`update leads set sla_state = 'escalated', updated_at = ? where id = ? and org_id = ?`)
          .run(nowIso(), lead.id, orgId);
        this.addActivity(orgId, actor.id, "lead", lead.id, "lead.sla_escalated", "SLA breached — escalated", {
          slaDueAt: lead.slaDueAt,
        });
        count += 1;
      } else if (state !== lead.slaState) {
        this.db
          .prepare(`update leads set sla_state = ?, updated_at = ? where id = ? and org_id = ?`)
          .run(state, nowIso(), lead.id, orgId);
      }
    }
    return count;
  }

  async findDuplicates(
    actor: SessionUser,
    orgId: string,
    input: { email?: string | null; phone?: string | null },
  ): Promise<Array<{ entityType: "lead" | "contact"; entityId: string; reason: string }>> {
    await this.gate(actor, orgId, "crm:read");
    const out: Array<{ entityType: "lead" | "contact"; entityId: string; reason: string }> = [];
    const email = normalizeEmail(input.email);
    const phone = normalizePhoneCrm(input.phone);
    if (email) {
      for (const row of this.db
        .prepare(`select id from leads where org_id = ? and email = ?`)
        .all(orgId, email) as Array<{ id: string }>) {
        out.push({ entityType: "lead", entityId: row.id, reason: "email" });
      }
      for (const row of this.db
        .prepare(`select id from contacts where org_id = ? and email = ?`)
        .all(orgId, email) as Array<{ id: string }>) {
        out.push({ entityType: "contact", entityId: row.id, reason: "email" });
      }
    }
    if (phone) {
      for (const row of this.db
        .prepare(`select id from leads where org_id = ? and phone = ?`)
        .all(orgId, phone) as Array<{ id: string }>) {
        out.push({ entityType: "lead", entityId: row.id, reason: "phone" });
      }
    }
    return out;
  }

  async mergeLeads(
    actor: SessionUser,
    orgId: string,
    primaryId: string,
    secondaryId: string,
  ): Promise<Lead> {
    await this.gate(actor, orgId, "crm:merge");
    if (primaryId === secondaryId) {
      throw new AuthError("Cannot merge a lead into itself", "validation");
    }
    const primary = await this.getLead(actor, orgId, primaryId);
    const secondary = await this.getLead(actor, orgId, secondaryId);
    const email = primary.email ?? secondary.email;
    const phone = primary.phone ?? secondary.phone;
    const customFields = { ...secondary.customFields, ...primary.customFields };
    this.db
      .prepare(
        `update leads set email = ?, phone = ?, custom_fields = ?, updated_at = ? where id = ? and org_id = ?`,
      )
      .run(email, phone, JSON.stringify(customFields), nowIso(), primaryId, orgId);
    this.db
      .prepare(
        `update activities set entity_id = ? where org_id = ? and entity_type = 'lead' and entity_id = ?`,
      )
      .run(primaryId, orgId, secondaryId);
    this.db
      .prepare(
        `update notes set entity_id = ? where org_id = ? and entity_type = 'lead' and entity_id = ?`,
      )
      .run(primaryId, orgId, secondaryId);
    this.db
      .prepare(
        `update tasks set entity_id = ? where org_id = ? and entity_type = 'lead' and entity_id = ?`,
      )
      .run(primaryId, orgId, secondaryId);
    this.db.prepare(`delete from leads where id = ? and org_id = ?`).run(secondaryId, orgId);
    this.addActivity(orgId, actor.id, "lead", primaryId, "lead.merged", "Merged duplicate lead", {
      secondaryId,
    });
    return this.getLead(actor, orgId, primaryId);
  }

  async createCompany(
    actor: SessionUser,
    orgId: string,
    input: { name: string; domain?: string; industry?: string },
  ): Promise<Company> {
    await this.gate(actor, orgId, "crm:write");
    const ts = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into companies(id, org_id, name, domain, industry, owner_user_id, custom_fields, created_at, updated_at)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, orgId, input.name, input.domain ?? null, input.industry ?? null, actor.id, "{}", ts, ts);
    this.addActivity(orgId, actor.id, "company", id, "company.created", `Company ${input.name}`);
    return {
      id,
      orgId,
      name: input.name,
      domain: input.domain ?? null,
      industry: input.industry ?? null,
      ownerUserId: actor.id,
      customFields: {},
      createdAt: ts,
      updatedAt: ts,
    };
  }

  async listCompanies(actor: SessionUser, orgId: string): Promise<Company[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from companies where org_id = ? order by name`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      name: r.name as string,
      domain: (r.domain as string) ?? null,
      industry: (r.industry as string) ?? null,
      ownerUserId: (r.owner_user_id as string) ?? null,
      customFields: jparse(r.custom_fields as string, {}),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  }

  async createContact(
    actor: SessionUser,
    orgId: string,
    input: {
      fullName: string;
      email?: string;
      phone?: string;
      companyId?: string;
      title?: string;
    },
  ): Promise<Contact> {
    await this.gate(actor, orgId, "crm:write");
    const ts = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into contacts(id, org_id, company_id, email, phone, full_name, title, owner_user_id, custom_fields, created_at, updated_at)
         values (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.companyId ?? null,
        normalizeEmail(input.email),
        normalizePhoneCrm(input.phone),
        input.fullName,
        input.title ?? null,
        actor.id,
        "{}",
        ts,
        ts,
      );
    this.addActivity(orgId, actor.id, "contact", id, "contact.created", `Contact ${input.fullName}`);
    return {
      id,
      orgId,
      companyId: input.companyId ?? null,
      email: normalizeEmail(input.email),
      phone: normalizePhoneCrm(input.phone),
      fullName: input.fullName,
      title: input.title ?? null,
      ownerUserId: actor.id,
      customFields: {},
      createdAt: ts,
      updatedAt: ts,
    };
  }

  async listContacts(actor: SessionUser, orgId: string): Promise<Contact[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from contacts where org_id = ? order by updated_at desc`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      companyId: (r.company_id as string) ?? null,
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      fullName: r.full_name as string,
      title: (r.title as string) ?? null,
      ownerUserId: (r.owner_user_id as string) ?? null,
      customFields: jparse(r.custom_fields as string, {}),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  }

  async createOpportunity(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      amount?: number;
      currency?: string;
      leadId?: string;
      contactId?: string;
      companyId?: string;
      ownerUserId?: string;
    },
  ): Promise<Opportunity> {
    await this.gate(actor, orgId, "crm:write");
    const pipelines = this.ensureDefaultPipelines(orgId);
    const stages = await this.listStages(actor, orgId, pipelines.deal.id);
    const stage = stages.find((s) => !s.isWon && !s.isLost) ?? stages[0];
    if (!stage) throw new AuthError("No deal stages", "validation");
    const ts = nowIso();
    const id = randomUUID();
    const owner = input.ownerUserId ?? actor.id;
    this.db
      .prepare(
        `insert into opportunities(
          id, org_id, name, pipeline_id, stage_id, lead_id, contact_id, company_id,
          amount, currency, status, owner_user_id, expected_close_date, custom_fields, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        pipelines.deal.id,
        stage.id,
        input.leadId ?? null,
        input.contactId ?? null,
        input.companyId ?? null,
        input.amount ?? 0,
        input.currency ?? "USD",
        "open",
        owner,
        null,
        "{}",
        ts,
        ts,
      );
    this.recordOwnership(orgId, "opportunity", id, null, owner, "created", actor.id);
    this.addActivity(orgId, actor.id, "opportunity", id, "opportunity.created", `Deal ${input.name}`);
    return this.getOpportunity(actor, orgId, id);
  }

  async getOpportunity(actor: SessionUser, orgId: string, id: string): Promise<Opportunity> {
    await this.gate(actor, orgId, "crm:read");
    const r = this.db
      .prepare(`select * from opportunities where id = ? and org_id = ?`)
      .get(id, orgId) as Record<string, unknown> | undefined;
    if (!r) throw new AuthError("Opportunity not found", "not_found");
    return this.mapOpp(r);
  }

  private mapOpp(r: Record<string, unknown>): Opportunity {
    return {
      id: r.id as string,
      orgId: r.org_id as string,
      name: r.name as string,
      pipelineId: r.pipeline_id as string,
      stageId: r.stage_id as string,
      leadId: (r.lead_id as string) ?? null,
      contactId: (r.contact_id as string) ?? null,
      companyId: (r.company_id as string) ?? null,
      amount: r.amount as number,
      currency: r.currency as string,
      status: r.status as Opportunity["status"],
      ownerUserId: (r.owner_user_id as string) ?? null,
      expectedCloseDate: (r.expected_close_date as string) ?? null,
      customFields: jparse(r.custom_fields as string, {}),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  async listOpportunities(actor: SessionUser, orgId: string): Promise<Opportunity[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from opportunities where org_id = ? order by updated_at desc`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapOpp(r));
  }

  async moveOpportunityStage(
    actor: SessionUser,
    orgId: string,
    oppId: string,
    stageId: string,
  ): Promise<Opportunity> {
    await this.gate(actor, orgId, "crm:write");
    const opp = await this.getOpportunity(actor, orgId, oppId);
    const stage = this.db
      .prepare(`select * from pipeline_stages where id = ? and org_id = ?`)
      .get(stageId, orgId) as
      | { id: string; name: string; is_won: number; is_lost: number }
      | undefined;
    if (!stage) throw new AuthError("Stage not found", "not_found");
    const status = stage.is_won ? "won" : stage.is_lost ? "lost" : "open";
    this.db
      .prepare(
        `update opportunities set stage_id = ?, status = ?, updated_at = ? where id = ? and org_id = ?`,
      )
      .run(stageId, status, nowIso(), oppId, orgId);
    this.addActivity(orgId, actor.id, "opportunity", oppId, "opportunity.stage_changed", `Stage → ${stage.name}`, {
      from: opp.stageId,
      to: stageId,
      status,
    });
    return this.getOpportunity(actor, orgId, oppId);
  }

  async createTask(
    actor: SessionUser,
    orgId: string,
    input: {
      title: string;
      entityType: CrmTask["entityType"];
      entityId: string;
      dueAt?: string;
      ownerUserId?: string;
      description?: string;
    },
  ): Promise<CrmTask> {
    await this.gate(actor, orgId, "crm:write");
    const ts = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into tasks(id, org_id, title, description, status, due_at, owner_user_id, entity_type, entity_id, created_at, updated_at)
         values (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.title,
        input.description ?? null,
        "open",
        input.dueAt ?? null,
        input.ownerUserId ?? actor.id,
        input.entityType,
        input.entityId,
        ts,
        ts,
      );
    this.addActivity(orgId, actor.id, input.entityType, input.entityId, "task.created", input.title);
    return {
      id,
      orgId,
      title: input.title,
      description: input.description ?? null,
      status: "open",
      dueAt: input.dueAt ?? null,
      ownerUserId: input.ownerUserId ?? actor.id,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  async listTasks(actor: SessionUser, orgId: string): Promise<CrmTask[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from tasks where org_id = ? order by due_at is null, due_at`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      title: r.title as string,
      description: (r.description as string) ?? null,
      status: r.status as CrmTask["status"],
      dueAt: (r.due_at as string) ?? null,
      ownerUserId: (r.owner_user_id as string) ?? null,
      entityType: r.entity_type as CrmTask["entityType"],
      entityId: r.entity_id as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  }

  async addNote(
    actor: SessionUser,
    orgId: string,
    input: {
      body: string;
      entityType: Note["entityType"];
      entityId: string;
    },
  ): Promise<Note> {
    await this.gate(actor, orgId, "crm:write");
    const ts = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `insert into notes(id, org_id, body, author_user_id, entity_type, entity_id, created_at)
         values (?,?,?,?,?,?,?)`,
      )
      .run(id, orgId, input.body, actor.id, input.entityType, input.entityId, ts);
    this.addActivity(orgId, actor.id, input.entityType, input.entityId, "note.added", "Note added");
    return {
      id,
      orgId,
      body: input.body,
      authorUserId: actor.id,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: ts,
    };
  }

  async listActivities(
    actor: SessionUser,
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<Activity[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(
        `select * from activities where org_id = ? and entity_type = ? and entity_id = ? order by created_at desc limit 200`,
      )
      .all(orgId, entityType, entityId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      actorUserId: (r.actor_user_id as string) ?? null,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      activityType: r.activity_type as string,
      summary: r.summary as string,
      payload: jparse(r.payload as string, {}),
      createdAt: r.created_at as string,
    }));
  }

  async listOwnershipHistory(
    actor: SessionUser,
    orgId: string,
    entityType: "lead" | "opportunity",
    entityId: string,
  ): Promise<OwnershipHistoryEntry[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(
        `select * from ownership_history where org_id = ? and entity_type = ? and entity_id = ? order by created_at desc`,
      )
      .all(orgId, entityType, entityId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      entityType: r.entity_type as "lead" | "opportunity",
      entityId: r.entity_id as string,
      fromUserId: (r.from_user_id as string) ?? null,
      toUserId: (r.to_user_id as string) ?? null,
      reason: r.reason as string,
      changedByUserId: r.changed_by_user_id as string,
      createdAt: r.created_at as string,
    }));
  }

  async upsertTag(actor: SessionUser, orgId: string, name: string, color?: string): Promise<Tag> {
    await this.gate(actor, orgId, "crm:write");
    const existing = this.db
      .prepare(`select * from tags where org_id = ? and name = ?`)
      .get(orgId, name) as { id: string; org_id: string; name: string; color: string | null } | undefined;
    if (existing) {
      return {
        id: existing.id,
        orgId,
        name: existing.name,
        color: existing.color,
      };
    }
    const id = randomUUID();
    this.db
      .prepare(`insert into tags(id, org_id, name, color) values (?,?,?,?)`)
      .run(id, orgId, name, color ?? null);
    return { id, orgId, name, color: color ?? null };
  }

  async tagEntity(
    actor: SessionUser,
    orgId: string,
    tagId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.gate(actor, orgId, "crm:write");
    this.db
      .prepare(
        `insert or ignore into taggings(tag_id, org_id, entity_type, entity_id) values (?,?,?,?)`,
      )
      .run(tagId, orgId, entityType, entityId);
  }

  async createCustomField(
    actor: SessionUser,
    orgId: string,
    input: Omit<CustomFieldDef, "id" | "orgId">,
  ): Promise<CustomFieldDef> {
    await this.gate(actor, orgId, "crm:write");
    const id = randomUUID();
    this.db
      .prepare(
        `insert into custom_field_defs(id, org_id, entity_type, key, label, field_type, options, required)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.entityType,
        input.key,
        input.label,
        input.fieldType,
        JSON.stringify(input.options),
        input.required ? 1 : 0,
      );
    return { id, orgId, ...input };
  }

  async listCustomFields(actor: SessionUser, orgId: string): Promise<CustomFieldDef[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from custom_field_defs where org_id = ?`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      entityType: r.entity_type as CustomFieldDef["entityType"],
      key: r.key as string,
      label: r.label as string,
      fieldType: r.field_type as CustomFieldDef["fieldType"],
      options: jparse(r.options as string, []),
      required: Boolean(r.required),
    }));
  }

  async saveView(
    actor: SessionUser,
    orgId: string,
    input: Omit<SavedView, "id" | "orgId" | "ownerUserId">,
  ): Promise<SavedView> {
    await this.gate(actor, orgId, "crm:write");
    const id = randomUUID();
    this.db
      .prepare(
        `insert into saved_views(id, org_id, name, entity_type, filters, columns, sort, owner_user_id)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.entityType,
        JSON.stringify(input.filters),
        JSON.stringify(input.columns),
        input.sort ? JSON.stringify(input.sort) : null,
        actor.id,
      );
    return { id, orgId, ownerUserId: actor.id, ...input };
  }

  async listSavedViews(actor: SessionUser, orgId: string): Promise<SavedView[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from saved_views where org_id = ?`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      name: r.name as string,
      entityType: r.entity_type as SavedView["entityType"],
      filters: jparse(r.filters as string, {}),
      columns: jparse(r.columns as string, []),
      sort: jparse(r.sort as string | null, null),
      ownerUserId: r.owner_user_id as string,
    }));
  }

  async createSegment(
    actor: SessionUser,
    orgId: string,
    input: Omit<Segment, "id" | "orgId">,
  ): Promise<Segment> {
    await this.gate(actor, orgId, "crm:write");
    const id = randomUUID();
    this.db
      .prepare(
        `insert into segments(id, org_id, name, entity_type, definition) values (?,?,?,?,?)`,
      )
      .run(id, orgId, input.name, input.entityType, JSON.stringify(input.definition));
    return { id, orgId, ...input };
  }

  async listSegments(actor: SessionUser, orgId: string): Promise<Segment[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from segments where org_id = ?`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      name: r.name as string,
      entityType: r.entity_type as Segment["entityType"],
      definition: jparse(r.definition as string, {}),
    }));
  }

  async upsertAssignmentRule(
    actor: SessionUser,
    orgId: string,
    input: Omit<AssignmentRule, "id" | "orgId"> & { id?: string },
  ): Promise<AssignmentRule> {
    await this.gate(actor, orgId, "crm:assign");
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `insert into assignment_rules(id, org_id, name, strategy, enabled, config)
         values (?,?,?,?,?,?)
         on conflict(id) do update set
           name = excluded.name,
           strategy = excluded.strategy,
           enabled = excluded.enabled,
           config = excluded.config`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.strategy,
        input.enabled ? 1 : 0,
        JSON.stringify(input.config),
      );
    return { id, orgId, name: input.name, strategy: input.strategy, enabled: input.enabled, config: input.config };
  }

  async listAssignmentRules(actor: SessionUser, orgId: string): Promise<AssignmentRule[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from assignment_rules where org_id = ?`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      name: r.name as string,
      strategy: r.strategy as AssignmentStrategy,
      enabled: Boolean(r.enabled),
      config: jparse(r.config as string, {}),
    }));
  }

  private async getActiveAssignmentRule(
    orgId: string,
    strategy: AssignmentStrategy,
  ): Promise<AssignmentRule | null> {
    const r = this.db
      .prepare(
        `select * from assignment_rules where org_id = ? and strategy = ? and enabled = 1 limit 1`,
      )
      .get(orgId, strategy) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      orgId,
      name: r.name as string,
      strategy: r.strategy as AssignmentStrategy,
      enabled: true,
      config: jparse(r.config as string, {}),
    };
  }

  async setAgentAvailability(
    actor: SessionUser,
    orgId: string,
    userId: string,
    available: boolean,
    territories: string[] = [],
  ): Promise<void> {
    await this.gate(actor, orgId, "crm:assign");
    this.db
      .prepare(
        `insert into agent_availability(org_id, user_id, available, territories) values (?,?,?,?)
         on conflict(org_id, user_id) do update set available = excluded.available, territories = excluded.territories`,
      )
      .run(orgId, userId, available ? 1 : 0, JSON.stringify(territories));
  }

  async getAgentWorkloads(orgId: string): Promise<AgentWorkload[]> {
    const members = [...(await this.tenancyListMembers(orgId))];
    return Promise.all(
      members.map(async (userId) => {
        const openLeads = (
          this.db
            .prepare(
              `select count(*) as c from leads where org_id = ? and owner_user_id = ? and status not in ('converted','archived')`,
            )
            .get(orgId, userId) as { c: number }
        ).c;
        const openTasks = (
          this.db
            .prepare(
              `select count(*) as c from tasks where org_id = ? and owner_user_id = ? and status = 'open'`,
            )
            .get(orgId, userId) as { c: number }
        ).c;
        const avail = this.db
          .prepare(`select available, territories from agent_availability where org_id = ? and user_id = ?`)
          .get(orgId, userId) as { available: number; territories: string } | undefined;
        return {
          userId,
          openLeads,
          openTasks,
          available: avail ? Boolean(avail.available) : true,
          territories: jparse(avail?.territories, []),
        };
      }),
    );
  }

  private async tenancyListMembers(orgId: string): Promise<string[]> {
    // Use tenancy store memberships via a privileged scan — platform path
    const fakeAdmin: SessionUser = {
      id: "system",
      email: "system@local",
      fullName: null,
      isPlatformAdmin: true,
    };
    const members = await this.tenancy.listMembers(fakeAdmin, orgId);
    return members.filter((m) => m.status === "active").map((m) => m.userId);
  }

  async createReminder(
    actor: SessionUser,
    orgId: string,
    input: {
      entityType: string;
      entityId: string;
      dueAt: string;
      assignedUserId?: string;
      note?: string;
    },
  ): Promise<FollowUpReminder> {
    await this.gate(actor, orgId, "crm:write");
    const id = randomUUID();
    const ts = nowIso();
    const assigned = input.assignedUserId ?? actor.id;
    this.db
      .prepare(
        `insert into follow_up_reminders(id, org_id, entity_type, entity_id, due_at, assigned_user_id, status, note, created_at)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.entityType,
        input.entityId,
        input.dueAt,
        assigned,
        "pending",
        input.note ?? null,
        ts,
      );
    this.addActivity(
      orgId,
      actor.id,
      input.entityType,
      input.entityId,
      "reminder.created",
      "Follow-up reminder set",
      { dueAt: input.dueAt },
    );
    return {
      id,
      orgId,
      entityType: input.entityType,
      entityId: input.entityId,
      dueAt: input.dueAt,
      assignedUserId: assigned,
      status: "pending",
      note: input.note ?? null,
      createdAt: ts,
    };
  }

  async listReminders(actor: SessionUser, orgId: string): Promise<FollowUpReminder[]> {
    await this.gate(actor, orgId, "crm:read");
    const rows = this.db
      .prepare(`select * from follow_up_reminders where org_id = ? order by due_at`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      dueAt: r.due_at as string,
      assignedUserId: r.assigned_user_id as string,
      status: r.status as FollowUpReminder["status"],
      note: (r.note as string) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  async addAttachmentMeta(
    actor: SessionUser,
    orgId: string,
    input: {
      fileName: string;
      contentType: string;
      sizeBytes: number;
      storagePath: string;
      entityType: string;
      entityId: string;
    },
  ) {
    await this.gate(actor, orgId, "crm:write");
    const id = randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `insert into attachments(id, org_id, file_name, content_type, size_bytes, storage_path, entity_type, entity_id, uploaded_by_user_id, created_at)
         values (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.fileName,
        input.contentType,
        input.sizeBytes,
        input.storagePath,
        input.entityType,
        input.entityId,
        actor.id,
        ts,
      );
    this.addActivity(orgId, actor.id, input.entityType, input.entityId, "attachment.added", input.fileName);
    return { id, orgId, ...input, uploadedByUserId: actor.id, createdAt: ts };
  }

  /** CSV import scaffolding — parses rows synchronously; durable worker path is Milestone 6. */
  async importLeadsCsv(
    actor: SessionUser,
    orgId: string,
    csv: string,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    await this.gate(actor, orgId, "crm:import");
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return { created: 0, skipped: 0, errors: ["Empty CSV"] };
    const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim());
      const row: Record<string, string> = {};
      header.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      try {
        const before = await this.findDuplicates(actor, orgId, {
          email: row.email,
          phone: row.phone,
        });
        if (before.some((d) => d.entityType === "lead")) {
          skipped += 1;
          continue;
        }
        await this.createLead(actor, orgId, {
          fullName: row.full_name || row.name || "Unknown",
          email: row.email,
          phone: row.phone,
          source: row.source || "csv_import",
          territory: row.territory,
          idempotencyKey: row.idempotency_key || `csv:${orgId}:${row.email || line}`,
        });
        created += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "row error");
      }
    }
    return { created, skipped, errors };
  }

  async exportLeadsCsv(actor: SessionUser, orgId: string): Promise<string> {
    await this.gate(actor, orgId, "crm:read");
    const leads = await this.listLeads(actor, orgId);
    const header = "id,full_name,email,phone,source,status,owner_user_id,territory,score,sla_state";
    const rows = leads.map((l) =>
      [
        l.id,
        JSON.stringify(l.fullName),
        l.email ?? "",
        l.phone ?? "",
        l.source,
        l.status,
        l.ownerUserId ?? "",
        l.territory ?? "",
        l.score,
        l.slaState,
      ].join(","),
    );
    return [header, ...rows].join("\n");
  }
}
