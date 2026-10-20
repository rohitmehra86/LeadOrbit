import { AuthError, type SessionUser } from "@leadorbit/db";
import type {
  AssignmentRule,
  AssignmentStrategy,
  Company,
  Contact,
  CrmTask,
  FollowUpReminder,
  Lead,
  LeadStatus,
  Opportunity,
  Pipeline,
  PipelineStage,
} from "@leadorbit/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LeadRow = {
  id: string;
  org_id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  company_id: string | null;
  contact_id: string | null;
  source: string;
  status: string;
  lifecycle_stage: string;
  score: number;
  owner_user_id: string | null;
  territory: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  idempotency_key: string | null;
  custom_fields: Record<string, unknown> | null;
  sla_due_at: string | null;
  sla_state: string;
  created_at: string;
  updated_at: string;
};

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name,
    companyId: row.company_id,
    contactId: row.contact_id,
    source: row.source,
    status: row.status as LeadStatus,
    lifecycleStage: row.lifecycle_stage,
    score: row.score,
    ownerUserId: row.owner_user_id,
    territory: row.territory,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    idempotencyKey: row.idempotency_key,
    customFields: row.custom_fields ?? {},
    slaDueAt: row.sla_due_at,
    slaState: (row.sla_state as Lead["slaState"]) ?? "ok",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row: Record<string, unknown>): CrmTask {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as CrmTask["status"],
    dueAt: (row.due_at as string | null) ?? null,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    entityType: row.entity_type as CrmTask["entityType"],
    entityId: String(row.entity_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapOpp(row: Record<string, unknown>): Opportunity {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    pipelineId: String(row.pipeline_id),
    stageId: String(row.stage_id),
    leadId: (row.lead_id as string | null) ?? null,
    contactId: (row.contact_id as string | null) ?? null,
    companyId: (row.company_id as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "USD"),
    status: row.status as Opportunity["status"],
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    expectedCloseDate: (row.expected_close_date as string | null) ?? null,
    customFields: (row.custom_fields as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

function unsupported(method: string): never {
  throw new AuthError(
    `CRM method "${method}" is not available on the Supabase adapter yet`,
    "validation",
  );
}

/** Durable CRM for AUTH_MODE=supabase (board + convert + Advanced list/create). */
export class SupabaseCrmStore {
  registerOrg(_orgId: string, _name: string): void {
    // Pipelines created lazily via ensure_org_pipelines on first board/lead access.
  }

  async ensurePipelines(orgId: string): Promise<{
    leadPipelineId: string;
    leadStageId: string;
    dealPipelineId: string;
    dealStageId: string;
  }> {
    const supabase = await client();
    const { data, error } = await supabase.rpc("ensure_org_pipelines", {
      p_org_id: orgId,
    });
    if (error) throw new AuthError(error.message, "validation");
    const row = data as Record<string, string>;
    return {
      leadPipelineId: String(row.leadPipelineId),
      leadStageId: String(row.leadStageId),
      dealPipelineId: String(row.dealPipelineId),
      dealStageId: String(row.dealStageId),
    };
  }

  async listPipelines(_actor: SessionUser, orgId: string): Promise<Pipeline[]> {
    await this.ensurePipelines(orgId);
    const supabase = await client();
    const { data, error } = await supabase.from("pipelines").select("*").eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      kind: r.kind as Pipeline["kind"],
      isDefault: Boolean(r.is_default),
    }));
  }

  async listStages(
    _actor: SessionUser,
    orgId: string,
    pipelineId: string,
  ): Promise<PipelineStage[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("org_id", orgId)
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      pipelineId: String(r.pipeline_id),
      name: String(r.name),
      position: Number(r.position),
      probability: Number(r.probability),
      isWon: Boolean(r.is_won),
      isLost: Boolean(r.is_lost),
    }));
  }

  async listLeads(
    _actor: SessionUser,
    orgId: string,
    opts?: { ownerUserId?: string; status?: string; stageId?: string },
  ): Promise<Lead[]> {
    const supabase = await client();
    let q = supabase
      .from("leads")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (opts?.ownerUserId) q = q.eq("owner_user_id", opts.ownerUserId);
    if (opts?.status) q = q.eq("status", opts.status);
    if (opts?.stageId) q = q.eq("stage_id", opts.stageId);
    const { data, error } = await q;
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as LeadRow[]).map(mapLead);
  }

  async getLead(_actor: SessionUser, orgId: string, leadId: string): Promise<Lead> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    if (!data) throw new AuthError("Lead not found", "not_found");
    return mapLead(data as LeadRow);
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
      score?: number;
    },
  ): Promise<Lead> {
    const supabase = await client();
    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from("leads")
        .select("*")
        .eq("org_id", orgId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) return mapLead(existing as LeadRow);
    }

    const pipes = await this.ensurePipelines(orgId);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        org_id: orgId,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone ?? null,
        full_name: input.fullName.trim(),
        source: input.source ?? "manual",
        status: "new",
        lifecycle_stage: "lead",
        score: input.score ?? 0,
        owner_user_id: input.ownerUserId ?? actor.id,
        territory: input.territory ?? null,
        pipeline_id: pipes.leadPipelineId,
        stage_id: pipes.leadStageId,
        idempotency_key: input.idempotencyKey ?? null,
        custom_fields: input.customFields ?? {},
        sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        sla_state: "ok",
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapLead(data as LeadRow);
  }

  async updateLeadScore(
    _actor: SessionUser,
    orgId: string,
    leadId: string,
    score: number,
    status?: LeadStatus,
  ): Promise<Lead> {
    const supabase = await client();
    const patch: Record<string, unknown> = {
      score: Math.max(0, Math.min(100, Math.round(score))),
      updated_at: new Date().toISOString(),
    };
    if (status) patch.status = status;
    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", leadId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapLead(data as LeadRow);
  }

  async updateLeadStage(
    _actor: SessionUser,
    orgId: string,
    leadId: string,
    stageId: string,
  ): Promise<Lead> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("leads")
      .update({ stage_id: stageId, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", leadId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapLead(data as LeadRow);
  }

  async assignLead(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    ownerUserId: string,
    reason = "manual_reassign",
  ): Promise<Lead> {
    const supabase = await client();
    const existing = await this.getLead(actor, orgId, leadId);
    const { data, error } = await supabase
      .from("leads")
      .update({
        owner_user_id: ownerUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("id", leadId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    await supabase.from("ownership_history").insert({
      org_id: orgId,
      entity_type: "lead",
      entity_id: leadId,
      from_user_id: existing.ownerUserId,
      to_user_id: ownerUserId,
      reason,
      changed_by_user_id: actor.id,
    });
    return mapLead(data as LeadRow);
  }

  async createTask(
    actor: SessionUser,
    orgId: string,
    input: {
      title: string;
      description?: string | null;
      dueAt?: string | null;
      ownerUserId?: string | null;
      entityType: string;
      entityId: string;
    },
  ): Promise<CrmTask> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({
        org_id: orgId,
        title: input.title.trim(),
        description: input.description ?? null,
        status: "open",
        due_at: input.dueAt ?? null,
        owner_user_id: input.ownerUserId ?? actor.id,
        entity_type: input.entityType,
        entity_id: input.entityId,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapTask(data as Record<string, unknown>);
  }

  async listTasks(_actor: SessionUser, orgId: string): Promise<CrmTask[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("crm_tasks")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapTask);
  }

  async listCompanies(_actor: SessionUser, orgId: string): Promise<Company[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("org_id", orgId)
      .order("name", { ascending: true });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      domain: (r.domain as string | null) ?? null,
      industry: (r.industry as string | null) ?? null,
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      customFields: (r.custom_fields as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createCompany(
    actor: SessionUser,
    orgId: string,
    input: { name: string; domain?: string; industry?: string },
  ): Promise<Company> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("companies")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        domain: input.domain ?? null,
        industry: input.industry ?? null,
        owner_user_id: actor.id,
        custom_fields: {},
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      domain: (r.domain as string | null) ?? null,
      industry: (r.industry as string | null) ?? null,
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      customFields: {},
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listContacts(_actor: SessionUser, orgId: string): Promise<Contact[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      companyId: (r.company_id as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      fullName: String(r.full_name),
      title: (r.title as string | null) ?? null,
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      customFields: (r.custom_fields as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
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
    const supabase = await client();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        org_id: orgId,
        company_id: input.companyId ?? null,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone ?? null,
        full_name: input.fullName.trim(),
        title: input.title ?? null,
        owner_user_id: actor.id,
        custom_fields: {},
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      companyId: (r.company_id as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      fullName: String(r.full_name),
      title: (r.title as string | null) ?? null,
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      customFields: {},
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listOpportunities(_actor: SessionUser, orgId: string): Promise<Opportunity[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapOpp);
  }

  async getOpportunity(
    _actor: SessionUser,
    orgId: string,
    id: string,
  ): Promise<Opportunity> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    if (!data) throw new AuthError("Opportunity not found", "not_found");
    return mapOpp(data as Record<string, unknown>);
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
    const pipes = await this.ensurePipelines(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("opportunities")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        pipeline_id: pipes.dealPipelineId,
        stage_id: pipes.dealStageId,
        lead_id: input.leadId ?? null,
        contact_id: input.contactId ?? null,
        company_id: input.companyId ?? null,
        amount: input.amount ?? 0,
        currency: input.currency ?? "USD",
        status: "open",
        owner_user_id: input.ownerUserId ?? actor.id,
        custom_fields: {},
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapOpp(data as Record<string, unknown>);
  }

  async moveOpportunityStage(
    actor: SessionUser,
    orgId: string,
    oppId: string,
    stageId: string,
  ): Promise<Opportunity> {
    const supabase = await client();
    const { data: stage, error: stageErr } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", stageId)
      .maybeSingle();
    if (stageErr) throw new AuthError(stageErr.message, "validation");
    if (!stage) throw new AuthError("Stage not found", "not_found");
    let status: Opportunity["status"] = "open";
    if (stage.is_won) status = "won";
    else if (stage.is_lost) status = "lost";
    const { data, error } = await supabase
      .from("opportunities")
      .update({
        stage_id: stageId,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("id", oppId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    void actor;
    return mapOpp(data as Record<string, unknown>);
  }

  async listReminders(_actor: SessionUser, orgId: string): Promise<FollowUpReminder[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("follow_up_reminders")
      .select("*")
      .eq("org_id", orgId)
      .order("due_at", { ascending: true });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      dueAt: String(r.due_at),
      assignedUserId: String(r.assigned_user_id),
      status: r.status as FollowUpReminder["status"],
      note: (r.note as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
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
    const supabase = await client();
    const { data, error } = await supabase
      .from("follow_up_reminders")
      .insert({
        org_id: orgId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        due_at: input.dueAt,
        assigned_user_id: input.assignedUserId ?? actor.id,
        status: "pending",
        note: input.note ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      dueAt: String(r.due_at),
      assignedUserId: String(r.assigned_user_id),
      status: "pending",
      note: (r.note as string | null) ?? null,
      createdAt: String(r.created_at),
    };
  }

  async listAssignmentRules(
    _actor: SessionUser,
    orgId: string,
  ): Promise<AssignmentRule[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("assignment_rules")
      .select("*")
      .eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      strategy: r.strategy as AssignmentStrategy,
      enabled: Boolean(r.enabled),
      config: (r.config as Record<string, unknown>) ?? {},
    }));
  }

  async upsertAssignmentRule(
    _actor: SessionUser,
    orgId: string,
    input: Omit<AssignmentRule, "id" | "orgId"> & { id?: string },
  ): Promise<AssignmentRule> {
    const supabase = await client();
    const row: Record<string, unknown> = {
      org_id: orgId,
      name: input.name,
      strategy: input.strategy,
      enabled: input.enabled,
      config: input.config,
      updated_at: new Date().toISOString(),
    };
    if (input.id) row.id = input.id;
    const { data, error } = input.id
      ? await supabase.from("assignment_rules").upsert(row, { onConflict: "id" }).select("*").single()
      : await supabase.from("assignment_rules").insert(row).select("*").single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      strategy: r.strategy as AssignmentStrategy,
      enabled: Boolean(r.enabled),
      config: (r.config as Record<string, unknown>) ?? {},
    };
  }

  async listActivities(
    _actor: SessionUser,
    orgId: string,
    entityType: string,
    entityId: string,
  ) {
    const supabase = await client();
    const { data, error } = await supabase
      .from("crm_activities")
      .select("*")
      .eq("org_id", orgId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      actorUserId: (r.actor_user_id as string | null) ?? null,
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      activityType: String(r.activity_type),
      summary: String(r.summary),
      payload: (r.payload as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
  }

  async addNote(
    actor: SessionUser,
    orgId: string,
    input: { body: string; entityType: string; entityId: string },
  ) {
    const supabase = await client();
    const { data, error } = await supabase
      .from("notes")
      .insert({
        org_id: orgId,
        body: input.body,
        author_user_id: actor.id,
        entity_type: input.entityType,
        entity_id: input.entityId,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      body: String(r.body),
      authorUserId: String(r.author_user_id),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      createdAt: String(r.created_at),
    };
  }

  async bookLeadAppointment(
    _actor: SessionUser,
    orgId: string,
    input: {
      leadId: string;
      startsAt: string;
      title?: string | null;
      durationMinutes?: number;
      kind?: string;
      siteVisitAddress?: string | null;
    },
  ) {
    const supabase = await client();
    const { data, error } = await supabase.rpc("book_lead_appointment", {
      p_org_id: orgId,
      p_lead_id: input.leadId,
      p_starts_at: input.startsAt,
      p_title: input.title ?? null,
      p_duration_minutes: input.durationMinutes ?? 30,
      p_kind: input.kind ?? "meeting",
      p_site_visit_address: input.siteVisitAddress ?? null,
    });
    if (error) throw new AuthError(error.message, "validation");
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      leadId: (row.lead_id as string | null) ?? null,
      title: String(row.title),
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      kind: String(row.kind),
      status: String(row.status),
      siteVisitAddress: (row.site_visit_address as string | null) ?? null,
    };
  }

  // Expert surfaces not yet ported — honest failures (no silent SQLite fallback).
  async importLeadsCsv(): Promise<never> {
    return unsupported("importLeadsCsv");
  }
  async exportLeadsCsv(): Promise<never> {
    return unsupported("exportLeadsCsv");
  }
  async mergeLeads(): Promise<never> {
    return unsupported("mergeLeads");
  }
  async findDuplicates(): Promise<never> {
    return unsupported("findDuplicates");
  }
  async escalateOverdueLeads(): Promise<never> {
    return unsupported("escalateOverdueLeads");
  }
}

let singleton: SupabaseCrmStore | null = null;
export function getSupabaseCrmStore(): SupabaseCrmStore {
  if (!singleton) singleton = new SupabaseCrmStore();
  return singleton;
}
