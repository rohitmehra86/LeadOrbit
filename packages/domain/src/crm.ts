export type AssignmentStrategy =
  | "manual"
  | "round_robin"
  | "workload_based"
  | "territory_based"
  | "availability_based"
  | "rules_based";

export type LeadStatus =
  | "new"
  | "working"
  | "qualified"
  | "unqualified"
  | "converted"
  | "archived";

export type OpportunityStatus = "open" | "won" | "lost";

export type TaskStatus = "open" | "done" | "canceled";

export type SlaState = "ok" | "warning" | "breached" | "escalated";

export interface Company {
  id: string;
  orgId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  ownerUserId: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  orgId: string;
  companyId: string | null;
  email: string | null;
  phone: string | null;
  fullName: string;
  title: string | null;
  ownerUserId: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  orgId: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  companyId: string | null;
  contactId: string | null;
  source: string;
  status: LeadStatus;
  lifecycleStage: string;
  score: number;
  ownerUserId: string | null;
  territory: string | null;
  pipelineId: string | null;
  stageId: string | null;
  idempotencyKey: string | null;
  customFields: Record<string, unknown>;
  slaDueAt: string | null;
  slaState: SlaState;
  createdAt: string;
  updatedAt: string;
}

export interface Pipeline {
  id: string;
  orgId: string;
  name: string;
  kind: "lead" | "deal";
  isDefault: boolean;
}

export interface PipelineStage {
  id: string;
  orgId: string;
  pipelineId: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

export interface Opportunity {
  id: string;
  orgId: string;
  name: string;
  pipelineId: string;
  stageId: string;
  leadId: string | null;
  contactId: string | null;
  companyId: string | null;
  amount: number;
  currency: string;
  status: OpportunityStatus;
  ownerUserId: string | null;
  expectedCloseDate: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CrmTask {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  ownerUserId: string | null;
  entityType: "lead" | "contact" | "company" | "opportunity";
  entityId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  orgId: string;
  body: string;
  authorUserId: string;
  entityType: "lead" | "contact" | "company" | "opportunity";
  entityId: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  orgId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  activityType: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AttachmentMeta {
  id: string;
  orgId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  entityType: string;
  entityId: string;
  uploadedByUserId: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  orgId: string;
  name: string;
  color: string | null;
}

export interface CustomFieldDef {
  id: string;
  orgId: string;
  entityType: "lead" | "contact" | "company" | "opportunity";
  key: string;
  label: string;
  fieldType: "text" | "number" | "bool" | "date" | "select";
  options: string[];
  required: boolean;
}

export interface SavedView {
  id: string;
  orgId: string;
  name: string;
  entityType: "lead" | "contact" | "opportunity" | "opportunity";
  filters: Record<string, unknown>;
  columns: string[];
  sort: { field: string; dir: "asc" | "desc" } | null;
  ownerUserId: string;
}

export interface Segment {
  id: string;
  orgId: string;
  name: string;
  entityType: "lead" | "contact";
  definition: Record<string, unknown>;
}

export interface AssignmentRule {
  id: string;
  orgId: string;
  name: string;
  strategy: AssignmentStrategy;
  enabled: boolean;
  config: {
    userIds?: string[];
    territories?: Record<string, string>;
    availableUserIds?: string[];
    rules?: Array<{
      field: string;
      op: "eq" | "contains";
      value: string;
      assignToUserId: string;
    }>;
    roundRobinCursor?: number;
  };
}

export interface OwnershipHistoryEntry {
  id: string;
  orgId: string;
  entityType: "lead" | "opportunity";
  entityId: string;
  fromUserId: string | null;
  toUserId: string | null;
  reason: string;
  changedByUserId: string;
  createdAt: string;
}

export interface FollowUpReminder {
  id: string;
  orgId: string;
  entityType: string;
  entityId: string;
  dueAt: string;
  assignedUserId: string;
  status: "pending" | "done" | "canceled";
  note: string | null;
  createdAt: string;
}

export interface AgentWorkload {
  userId: string;
  openLeads: number;
  openTasks: number;
  available: boolean;
  territories: string[];
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return v.length ? v : null;
}

export function normalizePhoneCrm(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const v = phone.replace(/[^\d+]/g, "");
  return v.length ? v : null;
}

export type DuplicateMatch = {
  entityType: "lead" | "contact";
  entityId: string;
  reason: "email" | "phone";
};

/** Pick assignee for a lead given strategy + agent pool. */
export function pickAssignee(input: {
  strategy: AssignmentStrategy;
  agents: AgentWorkload[];
  lead: { territory?: string | null; source?: string; email?: string | null };
  ruleConfig: AssignmentRule["config"];
  manualUserId?: string | null;
}): { userId: string | null; nextCursor?: number; reason: string } {
  const active = input.agents.filter((a) => a.available !== false);
  if (input.strategy === "manual") {
    return {
      userId: input.manualUserId ?? null,
      reason: "manual",
    };
  }
  if (active.length === 0) {
    return { userId: null, reason: "no_available_agents" };
  }

  if (input.strategy === "round_robin") {
    const pool =
      input.ruleConfig.userIds?.length
        ? active.filter((a) => input.ruleConfig.userIds!.includes(a.userId))
        : active;
    if (!pool.length) return { userId: null, reason: "empty_pool" };
    const cursor = input.ruleConfig.roundRobinCursor ?? 0;
    const idx = cursor % pool.length;
    return {
      userId: pool[idx]!.userId,
      nextCursor: cursor + 1,
      reason: "round_robin",
    };
  }

  if (input.strategy === "workload_based") {
    const sorted = [...active].sort(
      (a, b) => a.openLeads + a.openTasks - (b.openLeads + b.openTasks),
    );
    return { userId: sorted[0]!.userId, reason: "workload_based" };
  }

  if (input.strategy === "territory_based") {
    const territory = input.lead.territory;
    if (territory && input.ruleConfig.territories?.[territory]) {
      return {
        userId: input.ruleConfig.territories[territory]!,
        reason: "territory_based",
      };
    }
    const byTerritory = active.find((a) =>
      territory ? a.territories.includes(territory) : false,
    );
    return {
      userId: byTerritory?.userId ?? active[0]!.userId,
      reason: byTerritory ? "territory_based" : "territory_fallback",
    };
  }

  if (input.strategy === "availability_based") {
    const availableIds = new Set(input.ruleConfig.availableUserIds ?? active.map((a) => a.userId));
    const pool = active.filter((a) => availableIds.has(a.userId));
    if (!pool.length) return { userId: null, reason: "none_available" };
    const sorted = [...pool].sort((a, b) => a.openLeads - b.openLeads);
    return { userId: sorted[0]!.userId, reason: "availability_based" };
  }

  if (input.strategy === "rules_based") {
    const rules = input.ruleConfig.rules ?? [];
    for (const rule of rules) {
      const fieldVal = String(
        (input.lead as Record<string, unknown>)[rule.field] ?? "",
      ).toLowerCase();
      const target = rule.value.toLowerCase();
      const hit =
        rule.op === "eq" ? fieldVal === target : fieldVal.includes(target);
      if (hit) {
        return { userId: rule.assignToUserId, reason: `rule:${rule.field}` };
      }
    }
    return { userId: active[0]!.userId, reason: "rules_fallback" };
  }

  return { userId: null, reason: "unknown_strategy" };
}

export function computeSlaState(
  dueAt: string | null,
  now = new Date(),
): SlaState {
  if (!dueAt) return "ok";
  const due = new Date(dueAt).getTime();
  const t = now.getTime();
  if (t > due) return "breached";
  if (due - t < 60 * 60 * 1000) return "warning";
  return "ok";
}
