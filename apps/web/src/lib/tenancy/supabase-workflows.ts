import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError, getJobQueue, type SessionUser } from "@leadorbit/db";
import {
  convertLoopWorkflow,
  defaultLeadCreatedWorkflow,
  emptyWorkflowGraph,
  type WorkflowDefinition,
  type WorkflowEnrollment,
  type WorkflowGraph,
  type WorkflowStatus,
  type WorkflowStepRun,
  type WorkflowVersion,
} from "@leadorbit/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRlsPermissionError } from "@/lib/tenancy/rls-error";

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

function mapWorkflow(row: Record<string, unknown>): WorkflowDefinition {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    status: row.status as WorkflowStatus,
    graph: (row.graph as WorkflowGraph) ?? emptyWorkflowGraph(),
    version: Number(row.version ?? 1),
    testMode: Boolean(row.test_mode),
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEnrollment(row: Record<string, unknown>): WorkflowEnrollment {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    workflowId: String(row.workflow_id),
    workflowVersion: Number(row.workflow_version),
    leadId: (row.lead_id as string | null) ?? null,
    conversationId: (row.conversation_id as string | null) ?? null,
    status: row.status as WorkflowEnrollment["status"],
    currentNodeId: (row.current_node_id as string | null) ?? null,
    context: (row.context as Record<string, unknown>) ?? {},
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    testMode: Boolean(row.test_mode),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Durable workflows for AUTH_MODE=supabase. */
export class SupabaseWorkflowStore {
  async listWorkflows(_actor: SessionUser, orgId: string): Promise<WorkflowDefinition[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapWorkflow);
  }

  async createWorkflow(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      graph?: WorkflowGraph;
      template?: "lead_created" | "convert_loop" | null;
      testMode?: boolean;
    },
  ): Promise<WorkflowDefinition> {
    const supabase = await client();
    if (input.template === "convert_loop" && !input.graph) {
      const { data: seeded, error: seedErr } = await supabase.rpc(
        "seed_convert_workflow_template",
        { p_org_id: orgId, p_name: input.name },
      );
      if (seedErr) throw new AuthError(seedErr.message, "validation");
      const wf = await this.getWorkflow(actor, orgId, String(seeded));
      if (!wf) throw new AuthError("Failed to seed convert workflow", "validation");
      return wf;
    }

    const graph =
      input.graph ??
      (input.template === "lead_created"
        ? defaultLeadCreatedWorkflow()
        : input.template === "convert_loop"
          ? convertLoopWorkflow()
          : emptyWorkflowGraph());

    const { data, error } = await supabase
      .from("workflows")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        status: "draft",
        graph,
        version: 1,
        test_mode: Boolean(input.testMode),
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const wf = mapWorkflow(data as Record<string, unknown>);
    await supabase.from("workflow_versions").insert({
      org_id: orgId,
      workflow_id: wf.id,
      version: 1,
      graph,
      note: input.template ?? "initial",
    });
    await supabase.from("workflow_audit").insert({
      org_id: orgId,
      workflow_id: wf.id,
      action: "workflow.created",
      actor_user_id: actor.id,
      detail: { name: wf.name, template: input.template ?? null },
    });
    return wf;
  }

  async getWorkflow(
    _actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition | null> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", workflowId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    return data ? mapWorkflow(data as Record<string, unknown>) : null;
  }

  async updateWorkflow(
    actor: SessionUser,
    orgId: string,
    workflowId: string,
    patch: Partial<{
      name: string;
      graph: WorkflowGraph;
      testMode: boolean;
      status: WorkflowStatus;
    }>,
  ): Promise<WorkflowDefinition> {
    const existing = await this.getWorkflow(actor, orgId, workflowId);
    if (!existing) throw new AuthError("Workflow not found", "not_found");
    if (existing.status === "published" && patch.graph) {
      throw new AuthError(
        "Published workflows are immutable — pause or create a new draft",
        "conflict",
      );
    }
    const graphChanged = patch.graph !== undefined;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.graph !== undefined) {
      updates.graph = patch.graph;
      updates.version = existing.version + 1;
    }
    if (patch.testMode !== undefined) updates.test_mode = patch.testMode;
    if (patch.status !== undefined) updates.status = patch.status;

    const supabase = await client();
    const { data, error } = await supabase
      .from("workflows")
      .update(updates)
      .eq("org_id", orgId)
      .eq("id", workflowId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    if (graphChanged) {
      await supabase.from("workflow_versions").insert({
        org_id: orgId,
        workflow_id: workflowId,
        version: existing.version + 1,
        graph: patch.graph,
        note: "edit",
      });
    }
    return mapWorkflow(data as Record<string, unknown>);
  }

  async publishWorkflow(
    actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition> {
    const wf = await this.getWorkflow(actor, orgId, workflowId);
    if (!wf) throw new AuthError("Workflow not found", "not_found");
    const hasTrigger = wf.graph.nodes.some((n) => n.kind === "trigger");
    if (!hasTrigger) {
      throw new AuthError("Workflow needs at least one trigger", "validation");
    }
    const now = new Date().toISOString();
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflows")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("org_id", orgId)
      .eq("id", workflowId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    await supabase.from("workflow_audit").insert({
      org_id: orgId,
      workflow_id: workflowId,
      action: "workflow.published",
      actor_user_id: actor.id,
      detail: { version: wf.version },
    });
    return mapWorkflow(data as Record<string, unknown>);
  }

  async listVersions(
    _actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowVersion[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflow_versions")
      .select("*")
      .eq("org_id", orgId)
      .eq("workflow_id", workflowId)
      .order("version", { ascending: false });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      workflowId: String(r.workflow_id),
      version: Number(r.version),
      graph: (r.graph as WorkflowGraph) ?? emptyWorkflowGraph(),
      note: (r.note as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
  }

  async listEnrollments(
    _actor: SessionUser,
    orgId: string,
    workflowId?: string,
  ): Promise<WorkflowEnrollment[]> {
    const supabase = await client();
    let q = supabase
      .from("workflow_enrollments")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (workflowId) q = q.eq("workflow_id", workflowId);
    const { data, error } = await q;
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapEnrollment);
  }

  async listStepRuns(
    _actor: SessionUser,
    orgId: string,
    enrollmentId: string,
  ): Promise<WorkflowStepRun[]> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflow_step_runs")
      .select("*")
      .eq("org_id", orgId)
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: true });
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      enrollmentId: String(r.enrollment_id),
      nodeId: String(r.node_id),
      attempt: Number(r.attempt),
      status: r.status as WorkflowStepRun["status"],
      input: (r.input as Record<string, unknown>) ?? {},
      output: (r.output as Record<string, unknown>) ?? {},
      error: (r.error as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async listAudit(_actor: SessionUser, orgId: string) {
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflow_audit")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      workflowId: (r.workflow_id as string | null) ?? null,
      enrollmentId: (r.enrollment_id as string | null) ?? null,
      action: String(r.action),
      actorUserId: (r.actor_user_id as string | null) ?? null,
      detail: (r.detail as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
  }

  async enroll(
    actor: SessionUser,
    orgId: string,
    input: {
      workflowId: string;
      leadId?: string | null;
      conversationId?: string | null;
      idempotencyKey?: string | null;
      context?: Record<string, unknown>;
    },
  ): Promise<WorkflowEnrollment> {
    const wf = await this.getWorkflow(actor, orgId, input.workflowId);
    if (!wf) throw new AuthError("Workflow not found", "not_found");
    if (wf.status !== "published" && !wf.testMode) {
      throw new AuthError("Workflow must be published (or test mode) to enroll", "conflict");
    }
    const supabase = await client();
    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from("workflow_enrollments")
        .select("*")
        .eq("org_id", orgId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) return mapEnrollment(existing as Record<string, unknown>);
    }
    const trigger = wf.graph.nodes.find((n) => n.kind === "trigger");
    const { data, error } = await supabase
      .from("workflow_enrollments")
      .insert({
        org_id: orgId,
        workflow_id: wf.id,
        workflow_version: wf.version,
        lead_id: input.leadId ?? null,
        conversation_id: input.conversationId ?? null,
        status: "active",
        current_node_id: trigger?.id ?? null,
        context: input.context ?? {},
        idempotency_key: input.idempotencyKey ?? null,
        test_mode: wf.testMode,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const enrollment = mapEnrollment(data as Record<string, unknown>);
    await getJobQueue().enqueue(
      "workflow.tick",
      { orgId, enrollmentId: enrollment.id },
      { idempotencyKey: `wf-tick:${enrollment.id}:0` },
    );
    return enrollment;
  }

  async setEnrollmentStatus(
    _actor: SessionUser,
    orgId: string,
    enrollmentId: string,
    status: WorkflowEnrollment["status"],
  ): Promise<WorkflowEnrollment> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("workflow_enrollments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", enrollmentId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapEnrollment(data as Record<string, unknown>);
  }

  /**
   * Trigger dispatch for public form submit. Records enrollment when a published
   * form_submitted / lead_created workflow exists. Step execution is durable-queued
   * only when a worker is attached; otherwise enrollment stays at the trigger node.
   */
  async dispatchTrigger(input: {
    orgId: string;
    trigger: string;
    leadId?: string | null;
    conversationId?: string | null;
    context?: Record<string, unknown>;
    idempotencyPrefix?: string | null;
  }): Promise<number> {
    const run = async (supabase: SupabaseClient) => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("status", "published");
      if (error) throw new AuthError(error.message, "validation");
      let enrolled = 0;
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const wf = mapWorkflow(row);
        const match = wf.graph.nodes.some(
          (n) => n.kind === "trigger" && n.type === input.trigger,
        );
        if (!match) continue;
        const key = input.idempotencyPrefix
          ? `${input.idempotencyPrefix}:${wf.id}`
          : null;
        if (key) {
          const { data: existing } = await supabase
            .from("workflow_enrollments")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("idempotency_key", key)
            .maybeSingle();
          if (existing) continue;
        }
        const triggerNode = wf.graph.nodes.find(
          (n) => n.kind === "trigger" && n.type === input.trigger,
        );
        const { data: created, error: insErr } = await supabase
          .from("workflow_enrollments")
          .insert({
            org_id: input.orgId,
            workflow_id: wf.id,
            workflow_version: wf.version,
            lead_id: input.leadId ?? null,
            conversation_id: input.conversationId ?? null,
            status: "active",
            current_node_id: triggerNode?.id ?? null,
            context: { ...(input.context ?? {}), trigger: input.trigger },
            idempotency_key: key,
            test_mode: false,
          })
          .select("id")
          .single();
        if (insErr && isRlsPermissionError(insErr)) {
          throw new AuthError(insErr.message, "validation");
        }
        if (!insErr && created?.id) {
          enrolled += 1;
          await getJobQueue().enqueue(
            "workflow.tick",
            { orgId: input.orgId, enrollmentId: String(created.id) },
            { idempotencyKey: `wf-tick:${created.id}:0` },
          );
        }
      }
      return enrolled;
    };

    try {
      return await run(await client());
    } catch (err) {
      if (!(err instanceof AuthError) || !isRlsPermissionError({ message: err.message })) {
        throw err;
      }
      const admin = createSupabaseAdminClient();
      if (!admin) throw err;
      return run(admin);
    }
  }

  setCrmStore(_crm: unknown): void {
    // no-op; Supabase path uses direct table access
  }
}

let singleton: SupabaseWorkflowStore | null = null;
export function getSupabaseWorkflowStore(): SupabaseWorkflowStore {
  if (!singleton) singleton = new SupabaseWorkflowStore();
  return singleton;
}
