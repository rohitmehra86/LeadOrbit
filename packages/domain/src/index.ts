export type OrgType = "agency" | "workspace";

export type MembershipRole =
  | "owner"
  | "admin"
  | "manager"
  | "agent"
  | "viewer";

export type LifecycleStage =
  | "subscriber"
  | "lead"
  | "mql"
  | "sql"
  | "opportunity"
  | "customer"
  | "evangelist";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  orgType: OrgType;
  parentOrgId: string | null;
}

export interface Lead {
  id: string;
  orgId: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  source: string;
  lifecycleStage: LifecycleStage;
  score: number;
  ownerUserId: string | null;
}

export type JobName =
  | "lead.score"
  | "workflow.run_step"
  | "message.send"
  | "embedding.upsert"
  | "payment.reconcile"
  | "ads.sync";

export type JobPayloadMap = {
  "lead.score": { orgId: string; leadId: string };
  "workflow.run_step": {
    orgId: string;
    enrollmentId: string;
    stepId: string;
  };
  "message.send": { orgId: string; messageId: string };
  "embedding.upsert": {
    orgId: string;
    entityType: string;
    entityId: string;
  };
  "payment.reconcile": { orgId: string; paymentIntentId: string };
  "ads.sync": { orgId: string; connectionId: string };
};

const ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 1,
  agent: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

export function canManageMembers(role: MembershipRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.admin;
}

export function clampLeadScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "");
}
