import { AuthError, type SessionUser } from "@leadorbit/db";
import type { CrmTask, Lead, LeadStatus } from "@leadorbit/domain";
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

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

/** Durable CRM subset for AUTH_MODE=supabase (leads + tasks + assign). */
export class SupabaseCrmStore {
  async listLeads(
    _actor: SessionUser,
    orgId: string,
    opts?: { ownerUserId?: string; status?: string },
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

    const { data: pipeRows, error: pipeErr } = await supabase.rpc(
      "ensure_org_lead_pipeline",
      { p_org_id: orgId },
    );
    if (pipeErr) throw new AuthError(pipeErr.message, "validation");
    const pipe = Array.isArray(pipeRows) ? pipeRows[0] : pipeRows;

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
        pipeline_id: pipe?.pipeline_id ?? null,
        stage_id: pipe?.stage_id ?? null,
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

  async assignLead(
    actor: SessionUser,
    orgId: string,
    leadId: string,
    ownerUserId: string,
    _reason = "manual_reassign",
  ): Promise<Lead> {
    const supabase = await client();
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
    void actor;
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
    const row = data as {
      id: string;
      org_id: string;
      title: string;
      description: string | null;
      status: string;
      due_at: string | null;
      owner_user_id: string | null;
      entity_type: string;
      entity_id: string;
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      description: row.description,
      status: row.status as CrmTask["status"],
      dueAt: row.due_at,
      ownerUserId: row.owner_user_id,
      entityType: row.entity_type as CrmTask["entityType"],
      entityId: row.entity_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
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
    }));
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
}

let singleton: SupabaseCrmStore | null = null;
export function getSupabaseCrmStore(): SupabaseCrmStore {
  if (!singleton) singleton = new SupabaseCrmStore();
  return singleton;
}
