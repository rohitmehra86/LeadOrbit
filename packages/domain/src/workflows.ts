/** Milestone 6 — workflow automation */

export type WorkflowStatus = "draft" | "published" | "paused" | "archived";

export type WorkflowTriggerType =
  | "lead_created"
  | "form_submitted"
  | "status_changed"
  | "campaign_event"
  | "message_received"
  | "appointment_booked"
  | "appointment_missed"
  | "lead_score_changed"
  | "scheduled"
  | "deal_stage_changed";

export type WorkflowActionType =
  | "assign"
  | "update_field"
  | "tag"
  | "create_task"
  | "send_message"
  | "notify"
  | "wait"
  | "branch"
  | "webhook"
  | "ai_qualify"
  | "book_appointment"
  | "escalate";

export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "canceled"
  | "waiting";

export type StepRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "dead_letter";

export interface WorkflowNode {
  id: string;
  kind: "trigger" | "action";
  type: WorkflowTriggerType | WorkflowActionType;
  label: string;
  config: Record<string, unknown>;
  /** Visual builder coordinates */
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  /** For branch actions: "true" | "false" | label */
  label?: string | null;
}

export interface WorkflowGraph {
  version: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowDefinition {
  id: string;
  orgId: string;
  name: string;
  status: WorkflowStatus;
  graph: WorkflowGraph;
  version: number;
  testMode: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  orgId: string;
  workflowId: string;
  version: number;
  graph: WorkflowGraph;
  note: string | null;
  createdAt: string;
}

export interface WorkflowEnrollment {
  id: string;
  orgId: string;
  workflowId: string;
  workflowVersion: number;
  leadId: string | null;
  conversationId: string | null;
  status: EnrollmentStatus;
  currentNodeId: string | null;
  context: Record<string, unknown>;
  idempotencyKey: string | null;
  testMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepRun {
  id: string;
  orgId: string;
  enrollmentId: string;
  nodeId: string;
  attempt: number;
  status: StepRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAuditEntry {
  id: string;
  orgId: string;
  workflowId: string | null;
  enrollmentId: string | null;
  action: string;
  actorUserId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export function emptyWorkflowGraph(): WorkflowGraph {
  return { version: 1, nodes: [], edges: [] };
}

export function findTriggerNodes(graph: WorkflowGraph): WorkflowNode[] {
  return graph.nodes.filter((n) => n.kind === "trigger");
}

export function nextNodes(
  graph: WorkflowGraph,
  fromNodeId: string,
  branchLabel?: string | null,
): WorkflowNode[] {
  const outs = graph.edges.filter((e) => e.from === fromNodeId);
  const filtered =
    branchLabel == null
      ? outs
      : outs.filter((e) => (e.label ?? "true") === branchLabel);
  const ids = new Set(filtered.map((e) => e.to));
  return graph.nodes.filter((n) => ids.has(n.id));
}

export function evaluateBranch(
  config: Record<string, unknown>,
  context: Record<string, unknown>,
): "true" | "false" {
  const field = String(config.field ?? "");
  const op = String(config.op ?? "eq");
  const expected = config.value;
  const actual = context[field];
  if (op === "exists") return actual != null && actual !== "" ? "true" : "false";
  if (op === "eq") return String(actual) === String(expected) ? "true" : "false";
  if (op === "neq") return String(actual) !== String(expected) ? "true" : "false";
  if (op === "gt") return Number(actual) > Number(expected) ? "true" : "false";
  if (op === "lt") return Number(actual) < Number(expected) ? "true" : "false";
  return "false";
}

export function workflowStepRetryDelayMs(attempt: number): number | null {
  // attempts are 1-based after failure; max 3 tries then dead_letter
  if (attempt >= 3) return null;
  const delays = [5_000, 30_000, 120_000];
  return delays[attempt] ?? null;
}

export function defaultLeadCreatedWorkflow(): WorkflowGraph {
  const triggerId = "trg_lead";
  const assignId = "act_assign";
  const tagId = "act_tag";
  const waitId = "act_wait";
  const msgId = "act_msg";
  return {
    version: 1,
    nodes: [
      {
        id: triggerId,
        kind: "trigger",
        type: "lead_created",
        label: "Lead created",
        config: {},
        position: { x: 80, y: 80 },
      },
      {
        id: assignId,
        kind: "action",
        type: "assign",
        label: "Assign owner",
        config: { strategy: "round_robin" },
        position: { x: 80, y: 180 },
      },
      {
        id: tagId,
        kind: "action",
        type: "tag",
        label: "Tag new",
        config: { tag: "new-lead" },
        position: { x: 80, y: 280 },
      },
      {
        id: waitId,
        kind: "action",
        type: "wait",
        label: "Wait 1m",
        config: { delayMs: 60_000 },
        position: { x: 80, y: 380 },
      },
      {
        id: msgId,
        kind: "action",
        type: "send_message",
        label: "Send welcome",
        config: { channel: "email", templateKey: "welcome" },
        position: { x: 80, y: 480 },
      },
    ],
    edges: [
      { id: "e1", from: triggerId, to: assignId },
      { id: "e2", from: assignId, to: tagId },
      { id: "e3", from: tagId, to: waitId },
      { id: "e4", from: waitId, to: msgId },
    ],
  };
}
