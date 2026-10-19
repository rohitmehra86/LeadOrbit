export type OrgType = "agency" | "workspace";

export type MembershipRole =
  | "owner"
  | "admin"
  | "manager"
  | "agent"
  | "viewer";

export type MembershipStatus = "active" | "invited" | "disabled";

export type LifecycleStage =
  | "subscriber"
  | "lead"
  | "mql"
  | "sql"
  | "opportunity"
  | "customer"
  | "evangelist";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  orgType: OrgType;
  parentOrgId: string | null;
  timezone: string;
  locale: string;
  currency: string;
  branding: OrgBranding;
  createdAt: string;
  updatedAt: string;
}

export interface OrgBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  supportEmail: string | null;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: MembershipRole;
  status: InviteStatus;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
  /** Opaque token available only at creation time (never stored plaintext long-term in prod). */
  token?: string;
}

export interface FeatureFlag {
  id: string;
  orgId: string | null;
  key: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface SubscriptionEntitlement {
  id: string;
  orgId: string;
  planCode: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "none";
  seatsIncluded: number;
  features: Record<string, boolean>;
  renewsAt: string | null;
}

export interface UsageQuota {
  id: string;
  orgId: string;
  metric: string;
  limitValue: number;
  usedValue: number;
  periodStart: string;
  periodEnd: string;
}

export interface AuditLogEntry {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
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
