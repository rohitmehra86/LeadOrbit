import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  convertLoopWorkflow,
  defaultLeadCreatedWorkflow,
  emptyWorkflowGraph,
  evaluateBranch,
  findTriggerNodes,
  hasPermission,
  nextNodes,
  workflowStepRetryDelayMs,
  type EnrollmentStatus,
  type WorkflowActionType,
  type WorkflowAuditEntry,
  type WorkflowDefinition,
  type WorkflowEnrollment,
  type WorkflowGraph,
  type WorkflowStatus,
  type WorkflowStepRun,
  type WorkflowTriggerType,
  type WorkflowVersion,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import { SqliteJobQueue, type DurableJobQueue } from "./job-queue";
import type { CrmStore } from "./crm-store";
import { attemptProviderSend } from "@leadorbit/domain";

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

export class WorkflowStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private queue: DurableJobQueue = new SqliteJobQueue(db),
    private crm: CrmStore | null = null,
  ) {}

  setCrmStore(crm: CrmStore): void {
    this.crm = crm;
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "workflows:read" | "workflows:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private mapWorkflow(row: Record<string, unknown>): WorkflowDefinition {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      name: String(row.name),
      status: row.status as WorkflowStatus,
      graph: jparse(String(row.graph), emptyWorkflowGraph()),
      version: Number(row.version),
      testMode: Boolean(row.test_mode),
      publishedAt: row.published_at ? String(row.published_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapEnrollment(row: Record<string, unknown>): WorkflowEnrollment {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      workflowId: String(row.workflow_id),
      workflowVersion: Number(row.workflow_version),
      leadId: row.lead_id ? String(row.lead_id) : null,
      conversationId: row.conversation_id ? String(row.conversation_id) : null,
      status: row.status as EnrollmentStatus,
      currentNodeId: row.current_node_id ? String(row.current_node_id) : null,
      context: jparse(String(row.context), {}),
      idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
      testMode: Boolean(row.test_mode),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private audit(
    orgId: string,
    action: string,
    detail: Record<string, unknown>,
    opts?: {
      workflowId?: string | null;
      enrollmentId?: string | null;
      actorUserId?: string | null;
    },
  ): void {
    this.db
      .prepare(
        `insert into workflow_audit(id, org_id, workflow_id, enrollment_id, action, actor_user_id, detail, created_at)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        orgId,
        opts?.workflowId ?? null,
        opts?.enrollmentId ?? null,
        action,
        opts?.actorUserId ?? null,
        JSON.stringify(detail),
        nowIso(),
      );
  }

  async listWorkflows(
    actor: SessionUser,
    orgId: string,
  ): Promise<WorkflowDefinition[]> {
    await this.gate(actor, orgId, "workflows:read");
    const rows = this.db
      .prepare(`select * from workflows where org_id = ? order by updated_at desc`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapWorkflow(r));
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
    await this.gate(actor, orgId, "workflows:write");
    const id = randomUUID();
    const now = nowIso();
    const graph =
      input.graph ??
      (input.template === "lead_created"
        ? defaultLeadCreatedWorkflow()
        : input.template === "convert_loop"
          ? convertLoopWorkflow()
          : emptyWorkflowGraph());
    this.db
      .prepare(
        `insert into workflows(id, org_id, name, status, graph, version, test_mode, published_at, created_at, updated_at)
         values (?,?,?,'draft',?,1,?,null,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        JSON.stringify(graph),
        input.testMode ? 1 : 0,
        now,
        now,
      );
    this.db
      .prepare(
        `insert into workflow_versions(id, org_id, workflow_id, version, graph, note, created_at)
         values (?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), orgId, id, 1, JSON.stringify(graph), "initial", now);
    this.audit(orgId, "workflow.created", { name: input.name }, {
      workflowId: id,
      actorUserId: actor.id,
    });
    return (await this.getWorkflow(actor, orgId, id))!;
  }

  async getWorkflow(
    actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition | null> {
    await this.gate(actor, orgId, "workflows:read");
    const row = this.db
      .prepare(`select * from workflows where org_id = ? and id = ?`)
      .get(orgId, workflowId) as Record<string, unknown> | undefined;
    return row ? this.mapWorkflow(row) : null;
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
    await this.gate(actor, orgId, "workflows:write");
    const existing = await this.getWorkflow(actor, orgId, workflowId);
    if (!existing) throw new AuthError("Workflow not found", "not_found");
    if (existing.status === "published" && patch.graph) {
      throw new AuthError(
        "Published workflows are immutable — create a new draft version via unpublish or duplicate",
        "conflict",
      );
    }
    const graphChanged = patch.graph !== undefined;
    const next: WorkflowDefinition = {
      ...existing,
      ...patch,
      version: graphChanged ? existing.version + 1 : existing.version,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `update workflows set name=?, graph=?, version=?, test_mode=?, status=?, updated_at=?
         where org_id=? and id=?`,
      )
      .run(
        next.name,
        JSON.stringify(next.graph),
        next.version,
        next.testMode ? 1 : 0,
        next.status,
        next.updatedAt,
        orgId,
        workflowId,
      );
    if (graphChanged) {
      this.db
        .prepare(
          `insert into workflow_versions(id, org_id, workflow_id, version, graph, note, created_at)
           values (?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          orgId,
          workflowId,
          next.version,
          JSON.stringify(next.graph),
          "edit",
          nowIso(),
        );
    }
    this.audit(orgId, "workflow.updated", { patch: Object.keys(patch) }, {
      workflowId,
      actorUserId: actor.id,
    });
    return next;
  }

  async publishWorkflow(
    actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition> {
    await this.gate(actor, orgId, "workflows:write");
    const wf = await this.getWorkflow(actor, orgId, workflowId);
    if (!wf) throw new AuthError("Workflow not found", "not_found");
    const triggers = findTriggerNodes(wf.graph);
    if (triggers.length === 0) {
      throw new AuthError("Workflow needs at least one trigger", "validation");
    }
    const now = nowIso();
    this.db
      .prepare(
        `update workflows set status='published', published_at=?, updated_at=? where org_id=? and id=?`,
      )
      .run(now, now, orgId, workflowId);
    this.audit(orgId, "workflow.published", { version: wf.version }, {
      workflowId,
      actorUserId: actor.id,
    });
    return { ...wf, status: "published", publishedAt: now, updatedAt: now };
  }

  async pauseWorkflow(
    actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition> {
    return this.updateWorkflow(actor, orgId, workflowId, { status: "paused" });
  }

  async listVersions(
    actor: SessionUser,
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowVersion[]> {
    await this.gate(actor, orgId, "workflows:read");
    const rows = this.db
      .prepare(
        `select * from workflow_versions where org_id=? and workflow_id=? order by version desc`,
      )
      .all(orgId, workflowId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      workflowId: String(r.workflow_id),
      version: Number(r.version),
      graph: jparse(String(r.graph), emptyWorkflowGraph()),
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at),
    }));
  }

  async listEnrollments(
    actor: SessionUser,
    orgId: string,
    workflowId?: string,
  ): Promise<WorkflowEnrollment[]> {
    await this.gate(actor, orgId, "workflows:read");
    const rows = (
      workflowId
        ? this.db
            .prepare(
              `select * from workflow_enrollments where org_id=? and workflow_id=? order by created_at desc limit 100`,
            )
            .all(orgId, workflowId)
        : this.db
            .prepare(
              `select * from workflow_enrollments where org_id=? order by created_at desc limit 100`,
            )
            .all(orgId)
    ) as Record<string, unknown>[];
    return rows.map((r) => this.mapEnrollment(r));
  }

  async listStepRuns(
    actor: SessionUser,
    orgId: string,
    enrollmentId: string,
  ): Promise<WorkflowStepRun[]> {
    await this.gate(actor, orgId, "workflows:read");
    const rows = this.db
      .prepare(
        `select * from workflow_step_runs where org_id=? and enrollment_id=? order by created_at asc`,
      )
      .all(orgId, enrollmentId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      enrollmentId: String(r.enrollment_id),
      nodeId: String(r.node_id),
      attempt: Number(r.attempt),
      status: r.status as WorkflowStepRun["status"],
      input: jparse(String(r.input), {}),
      output: jparse(String(r.output), {}),
      error: r.error ? String(r.error) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async listAudit(
    actor: SessionUser,
    orgId: string,
  ): Promise<WorkflowAuditEntry[]> {
    await this.gate(actor, orgId, "workflows:read");
    const rows = this.db
      .prepare(
        `select * from workflow_audit where org_id=? order by created_at desc limit 100`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      workflowId: r.workflow_id ? String(r.workflow_id) : null,
      enrollmentId: r.enrollment_id ? String(r.enrollment_id) : null,
      action: String(r.action),
      actorUserId: r.actor_user_id ? String(r.actor_user_id) : null,
      detail: jparse(String(r.detail), {}),
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Enroll an entity into a published workflow and enqueue durable tick to worker.
   * Does NOT execute steps in-process.
   */
  async enroll(
    actor: SessionUser | null,
    orgId: string,
    input: {
      workflowId: string;
      leadId?: string | null;
      conversationId?: string | null;
      context?: Record<string, unknown>;
      idempotencyKey?: string | null;
      testMode?: boolean;
    },
  ): Promise<{ enrollment: WorkflowEnrollment; jobId: string; duplicate: boolean }> {
    if (actor) await this.gate(actor, orgId, "workflows:write");
    const wfRow = this.db
      .prepare(`select * from workflows where org_id=? and id=?`)
      .get(orgId, input.workflowId) as Record<string, unknown> | undefined;
    if (!wfRow) throw new AuthError("Workflow not found", "not_found");
    const wf = this.mapWorkflow(wfRow);
    if (wf.status !== "published" && !input.testMode && !wf.testMode) {
      throw new AuthError("Workflow is not published", "conflict");
    }
    const idem = input.idempotencyKey ?? null;
    if (idem) {
      const existing = this.db
        .prepare(
          `select * from workflow_enrollments where org_id=? and idempotency_key=?`,
        )
        .get(orgId, idem) as Record<string, unknown> | undefined;
      if (existing) {
        const enrollment = this.mapEnrollment(existing);
        return { enrollment, jobId: enrollment.id, duplicate: true };
      }
    }
    const trigger = findTriggerNodes(wf.graph)[0];
    const id = randomUUID();
    const now = nowIso();
    const testMode = Boolean(input.testMode ?? wf.testMode);
    this.db
      .prepare(
        `insert into workflow_enrollments(
          id, org_id, workflow_id, workflow_version, lead_id, conversation_id, status,
          current_node_id, context, idempotency_key, test_mode, created_at, updated_at
        ) values (?,?,?,?,?,?,'active',?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        wf.id,
        wf.version,
        input.leadId ?? null,
        input.conversationId ?? null,
        trigger?.id ?? null,
        JSON.stringify(input.context ?? {}),
        idem,
        testMode ? 1 : 0,
        now,
        now,
      );
    const job = await this.queue.enqueue(
      "workflow.tick",
      { orgId, enrollmentId: id },
      { idempotencyKey: `wf-tick:${id}:start` },
    );
    this.audit(
      orgId,
      "enrollment.created",
      { jobId: job.jobId, testMode },
      { workflowId: wf.id, enrollmentId: id, actorUserId: actor?.id ?? null },
    );
    const enrollment = this.mapEnrollment(
      this.db
        .prepare(`select * from workflow_enrollments where id=?`)
        .get(id) as Record<string, unknown>,
    );
    return { enrollment, jobId: job.jobId, duplicate: false };
  }

  async setEnrollmentStatus(
    actor: SessionUser,
    orgId: string,
    enrollmentId: string,
    status: EnrollmentStatus,
  ): Promise<WorkflowEnrollment> {
    await this.gate(actor, orgId, "workflows:write");
    const row = this.db
      .prepare(`select * from workflow_enrollments where org_id=? and id=?`)
      .get(orgId, enrollmentId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Enrollment not found", "not_found");
    const now = nowIso();
    this.db
      .prepare(
        `update workflow_enrollments set status=?, updated_at=? where id=?`,
      )
      .run(status, now, enrollmentId);
    if (status === "active") {
      await this.queue.enqueue(
        "workflow.tick",
        { orgId, enrollmentId },
        { idempotencyKey: `wf-tick:${enrollmentId}:resume:${now}` },
      );
    }
    this.audit(orgId, `enrollment.${status}`, {}, {
      enrollmentId,
      actorUserId: actor.id,
      workflowId: String(row.workflow_id),
    });
    return this.mapEnrollment(
      this.db
        .prepare(`select * from workflow_enrollments where id=?`)
        .get(enrollmentId) as Record<string, unknown>,
    );
  }

  /**
   * Match published workflows for a trigger and enroll (enqueue only).
   * Safe to call from BFF after lead/form events.
   */
  async dispatchTrigger(input: {
    orgId: string;
    trigger: WorkflowTriggerType;
    leadId?: string | null;
    conversationId?: string | null;
    context?: Record<string, unknown>;
    idempotencyPrefix?: string;
  }): Promise<number> {
    const rows = this.db
      .prepare(`select * from workflows where org_id=? and status='published'`)
      .all(input.orgId) as Record<string, unknown>[];
    let count = 0;
    for (const row of rows) {
      const wf = this.mapWorkflow(row);
      const triggers = findTriggerNodes(wf.graph).filter(
        (t) => t.type === input.trigger,
      );
      if (triggers.length === 0) continue;
      const idem = input.idempotencyPrefix
        ? `${input.idempotencyPrefix}:${wf.id}`
        : null;
      await this.enroll(null, input.orgId, {
        workflowId: wf.id,
        leadId: input.leadId,
        conversationId: input.conversationId,
        context: { ...input.context, trigger: input.trigger },
        idempotencyKey: idem,
      });
      count += 1;
    }
    return count;
  }

  /** Worker entry: advance one enrollment tick. */
  async processTick(orgId: string, enrollmentId: string): Promise<void> {
    const row = this.db
      .prepare(`select * from workflow_enrollments where org_id=? and id=?`)
      .get(orgId, enrollmentId) as Record<string, unknown> | undefined;
    if (!row) return;
    let enrollment = this.mapEnrollment(row);
    if (
      enrollment.status === "canceled" ||
      enrollment.status === "completed" ||
      enrollment.status === "failed" ||
      enrollment.status === "paused"
    ) {
      return;
    }

    // Delayed wait jobs resume by calling processTick; flip waiting → active.
    if (enrollment.status === "waiting") {
      this.db
        .prepare(
          `update workflow_enrollments set status='active', updated_at=? where id=?`,
        )
        .run(nowIso(), enrollmentId);
      enrollment = { ...enrollment, status: "active" };
    }

    const wfRow = this.db
      .prepare(`select * from workflows where org_id=? and id=?`)
      .get(orgId, enrollment.workflowId) as Record<string, unknown> | undefined;
    if (!wfRow) return;
    const wf = this.mapWorkflow(wfRow);
    const node = wf.graph.nodes.find((n) => n.id === enrollment.currentNodeId);
    if (!node) {
      this.finishEnrollment(enrollment.id, "completed");
      return;
    }

    if (node.kind === "trigger") {
      const nxt = nextNodes(wf.graph, node.id)[0];
      this.advance(enrollment.id, nxt?.id ?? null, enrollment.context);
      if (nxt) {
        await this.queue.enqueue(
          "workflow.tick",
          { orgId, enrollmentId },
          { idempotencyKey: `wf-tick:${enrollmentId}:${nxt.id}` },
        );
      } else {
        this.finishEnrollment(enrollment.id, "completed");
      }
      return;
    }

    const attempt =
      (
        this.db
          .prepare(
            `select count(*) as c from workflow_step_runs where enrollment_id=? and node_id=?`,
          )
          .get(enrollmentId, node.id) as { c: number }
      ).c + 1;

    const stepId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into workflow_step_runs(
          id, org_id, enrollment_id, node_id, attempt, status, input, output, error, created_at, updated_at
        ) values (?,?,?,?,?,'running',?,?,null,?,?)`,
      )
      .run(
        stepId,
        orgId,
        enrollmentId,
        node.id,
        attempt,
        JSON.stringify({ config: node.config, context: enrollment.context }),
        "{}",
        now,
        now,
      );

    try {
      const result = await this.executeAction(
        orgId,
        enrollment,
        node.type as WorkflowActionType,
        node.config,
      );
      this.db
        .prepare(
          `update workflow_step_runs set status='succeeded', output=?, updated_at=? where id=?`,
        )
        .run(JSON.stringify(result.output), nowIso(), stepId);

      if (result.waitMs != null) {
        this.db
          .prepare(
            `update workflow_enrollments set status='waiting', updated_at=? where id=?`,
          )
          .run(nowIso(), enrollmentId);
        const nxt = nextNodes(wf.graph, node.id)[0];
        this.advance(enrollmentId, nxt?.id ?? null, {
          ...enrollment.context,
          ...result.contextPatch,
        });
        await this.queue.enqueue(
          "workflow.tick",
          { orgId, enrollmentId },
          {
            delayMs: result.waitMs,
            idempotencyKey: `wf-tick:${enrollmentId}:wait:${node.id}:${attempt}`,
          },
        );
        return;
      }

      const branch = result.branchLabel;
      const nxt = nextNodes(wf.graph, node.id, branch)[0];
      this.advance(enrollmentId, nxt?.id ?? null, {
        ...enrollment.context,
        ...result.contextPatch,
      });
      if (nxt) {
        this.db
          .prepare(
            `update workflow_enrollments set status='active', updated_at=? where id=?`,
          )
          .run(nowIso(), enrollmentId);
        await this.queue.enqueue(
          "workflow.tick",
          { orgId, enrollmentId },
          { idempotencyKey: `wf-tick:${enrollmentId}:${nxt.id}:${attempt}` },
        );
      } else {
        this.finishEnrollment(enrollmentId, "completed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "step failed";
      this.db
        .prepare(
          `update workflow_step_runs set status='failed', error=?, updated_at=? where id=?`,
        )
        .run(message, nowIso(), stepId);
      const delay = workflowStepRetryDelayMs(attempt);
      if (delay == null) {
        this.db
          .prepare(
            `update workflow_step_runs set status='dead_letter', updated_at=? where id=?`,
          )
          .run(nowIso(), stepId);
        this.finishEnrollment(enrollmentId, "failed");
        this.audit(orgId, "enrollment.dead_letter", { nodeId: node.id, message }, {
          enrollmentId,
          workflowId: enrollment.workflowId,
        });
        return;
      }
      await this.queue.enqueue(
        "workflow.tick",
        { orgId, enrollmentId },
        {
          delayMs: delay,
          idempotencyKey: `wf-tick:${enrollmentId}:retry:${node.id}:${attempt}`,
        },
      );
    }
  }

  private advance(
    enrollmentId: string,
    nodeId: string | null,
    context: Record<string, unknown>,
  ): void {
    this.db
      .prepare(
        `update workflow_enrollments set current_node_id=?, context=?, updated_at=? where id=?`,
      )
      .run(nodeId, JSON.stringify(context), nowIso(), enrollmentId);
  }

  private finishEnrollment(enrollmentId: string, status: EnrollmentStatus): void {
    this.db
      .prepare(
        `update workflow_enrollments set status=?, current_node_id=null, updated_at=? where id=?`,
      )
      .run(status, nowIso(), enrollmentId);
  }

  private async executeAction(
    orgId: string,
    enrollment: WorkflowEnrollment,
    type: WorkflowActionType,
    config: Record<string, unknown>,
  ): Promise<{
    output: Record<string, unknown>;
    contextPatch: Record<string, unknown>;
    waitMs?: number;
    branchLabel?: string | null;
  }> {
    switch (type) {
      case "assign": {
        let assignDetail: Record<string, unknown> = {
          assigned: false,
          strategy: config.strategy ?? "manual",
        };
        if (this.crm && enrollment.leadId) {
          const actor: SessionUser = {
            id: "system-workflow",
            email: "workflow@leadorbit.local",
            fullName: "Workflow",
            isPlatformAdmin: true,
          };
          try {
            if (config.ownerUserId) {
              await this.crm.assignLead(
                actor,
                orgId,
                enrollment.leadId,
                String(config.ownerUserId),
                "workflow_assign",
              );
            } else {
              await this.crm.autoAssignLead(
                actor,
                orgId,
                enrollment.leadId,
                (config.strategy as "round_robin") || "round_robin",
              );
            }
            assignDetail = { ...assignDetail, assigned: true };
          } catch (err) {
            assignDetail = {
              ...assignDetail,
              assigned: false,
              warning: err instanceof Error ? err.message : "assign skipped",
            };
          }
        }
        return { output: assignDetail, contextPatch: {} };
      }
      case "update_field": {
        const field = String(config.field ?? "status");
        const value = config.value;
        return {
          output: { field, value },
          contextPatch: { [field]: value },
        };
      }
      case "tag":
        return {
          output: { tag: config.tag },
          contextPatch: {
            tags: [
              ...((enrollment.context.tags as string[]) ?? []),
              String(config.tag ?? "tagged"),
            ],
          },
        };
      case "create_task": {
        if (this.crm && enrollment.leadId) {
          const actor: SessionUser = {
            id: "system-workflow",
            email: "workflow@leadorbit.local",
            fullName: "Workflow",
            isPlatformAdmin: true,
          };
          await this.crm.createTask(actor, orgId, {
            title: String(config.title ?? "Workflow task"),
            entityType: "lead",
            entityId: enrollment.leadId,
            description: String(config.description ?? ""),
          });
        }
        return { output: { task: true }, contextPatch: {} };
      }
      case "notify":
        return {
          output: { notified: String(config.message ?? "Workflow notification") },
          contextPatch: {},
        };
      case "wait":
        return {
          output: { waited: true },
          contextPatch: {},
          waitMs: Number(config.delayMs ?? 1000),
        };
      case "branch": {
        const label = evaluateBranch(config, enrollment.context);
        return { output: { branch: label }, contextPatch: {}, branchLabel: label };
      }
      case "webhook": {
        // Scaffold only — record intent, do not claim live HTTP from worker beyond enqueue.
        return {
          output: {
            webhookUrl: config.url ?? null,
            status: "scaffolded",
          },
          contextPatch: {},
        };
      }
      case "ai_qualify": {
        const key = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
        return {
          output: {
            status: key ? "unverified" : "unverified",
            reason: key
              ? "LLM key present but provider not verified"
              : "LLM_API_KEY not configured",
            score: key ? 50 : null,
          },
          contextPatch: key ? { aiScore: 50 } : {},
        };
      }
      case "book_appointment":
        return {
          output: {
            appointmentAt: config.at ?? null,
            status: "scaffolded",
          },
          contextPatch: { appointmentBooked: true },
        };
      case "escalate":
        return {
          output: { escalated: true, to: config.to ?? "manager" },
          contextPatch: { escalated: true },
        };
      case "send_message": {
        // Enqueue durable message.send — do not send inside tick beyond queueing.
        const channel = String(config.channel ?? "email");
        const body = String(
          config.body ?? `Workflow message (${config.templateKey ?? "default"})`,
        );
        const messageId = randomUUID();
        // Persist a queued outbound message row for inbox visibility
        const convId = enrollment.conversationId ?? randomUUID();
        if (!enrollment.conversationId) {
          this.db
            .prepare(
              `insert into conversations(
                id, org_id, channel, subject, status, assignee_user_id, lead_id, contact_address,
                unread_count, tags, sla_due_at, last_message_at, consent_ok, opted_out, created_at, updated_at
              ) values (?,?,?,?,'open',?,?,?,0,'[]',null,?,?,0,?,?)`,
            )
            .run(
              convId,
              orgId,
              channel,
              "Workflow outreach",
              null,
              enrollment.leadId,
              null,
              nowIso(),
              1,
              nowIso(),
              nowIso(),
            );
          this.db
            .prepare(
              `update workflow_enrollments set conversation_id=? where id=?`,
            )
            .run(convId, enrollment.id);
        }
        const send = attemptProviderSend({
          channel: channel as never,
          to: String(enrollment.context.email ?? "unknown"),
          body,
          testMode: enrollment.testMode,
        });
        this.db
          .prepare(
            `insert into inbox_messages(
              id, org_id, conversation_id, direction, channel, body, html_body, template_key,
              attachment_paths, delivery_status, provider_message_id, sender_user_id, is_internal_note, error, created_at
            ) values (?,?,?,'outbound',?,?,?,?,?,?,?,?,0,?,?)`,
          )
          .run(
            messageId,
            orgId,
            convId,
            channel,
            body,
            null,
            config.templateKey ? String(config.templateKey) : null,
            "[]",
            send.deliveryStatus,
            send.providerMessageId,
            null,
            send.error,
            nowIso(),
          );
        await this.queue.enqueue(
          "message.send",
          { orgId, messageId },
          { idempotencyKey: `msg-send:${messageId}` },
        );
        return {
          output: {
            messageId,
            deliveryStatus: send.deliveryStatus,
          },
          contextPatch: { lastMessageId: messageId },
        };
      }
      default:
        return { output: { skipped: true }, contextPatch: {} };
    }
  }
}
