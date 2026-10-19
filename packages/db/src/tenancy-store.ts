import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  AuditLogEntry,
  FeatureFlag,
  Invite,
  Membership,
  MembershipRole,
  Organization,
  OrgBranding,
  OrgType,
  Profile,
  SubscriptionEntitlement,
  UsageQuota,
} from "@leadorbit/domain";
import { hasPermission, slugifyOrgName } from "@leadorbit/domain";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "unauthorized" | "forbidden" | "not_found" | "conflict" | "validation",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  isPlatformAdmin: boolean;
};

type StoredUser = Profile & { passwordHash: string };

function nowIso(): string {
  return new Date().toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const derived = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

const DEFAULT_BRANDING: OrgBranding = {
  logoUrl: null,
  primaryColor: null,
  accentColor: null,
  supportEmail: null,
};

/**
 * In-process tenancy store for local progress when Supabase is unavailable.
 * Enforces the same permission rules as the service layer / intended RLS.
 * Does NOT claim Postgres RLS verification.
 */
export class LocalTenancyStore {
  private users = new Map<string, StoredUser>();
  private usersByEmail = new Map<string, string>();
  private orgs = new Map<string, Organization>();
  private memberships = new Map<string, Membership>();
  private invites = new Map<string, Invite & { tokenHash: string }>();
  private flags = new Map<string, FeatureFlag>();
  private entitlements = new Map<string, SubscriptionEntitlement>();
  private quotas = new Map<string, UsageQuota>();
  private audits: AuditLogEntry[] = [];
  private platformAdmins = new Set<string>();

  async signUp(input: {
    email: string;
    password: string;
    fullName?: string;
  }): Promise<SessionUser> {
    const email = input.email.trim().toLowerCase();
    if (!email || input.password.length < 8) {
      throw new AuthError("Valid email and password (8+) required", "validation");
    }
    if (this.usersByEmail.has(email)) {
      throw new AuthError("Email already registered", "conflict");
    }
    const id = randomUUID();
    const ts = nowIso();
    const profile: StoredUser = {
      id,
      email,
      fullName: input.fullName ?? null,
      avatarUrl: null,
      createdAt: ts,
      updatedAt: ts,
      passwordHash: hashPassword(input.password),
    };
    this.users.set(id, profile);
    this.usersByEmail.set(email, id);
    return this.toSession(profile);
  }

  async signIn(email: string, password: string): Promise<SessionUser> {
    const id = this.usersByEmail.get(email.trim().toLowerCase());
    if (!id) throw new AuthError("Invalid credentials", "unauthorized");
    const user = this.users.get(id)!;
    if (!verifyPassword(password, user.passwordHash)) {
      throw new AuthError("Invalid credentials", "unauthorized");
    }
    return this.toSession(user);
  }

  async getUser(userId: string): Promise<SessionUser | null> {
    const user = this.users.get(userId);
    return user ? this.toSession(user) : null;
  }

  async createOrganization(
    actor: SessionUser,
    input: { name: string; orgType?: OrgType; timezone?: string; locale?: string; currency?: string },
  ): Promise<Organization> {
    const name = input.name.trim();
    if (name.length < 2) throw new AuthError("Organization name too short", "validation");
    let slug = slugifyOrgName(name) || `org-${randomUUID().slice(0, 8)}`;
    if ([...this.orgs.values()].some((o) => o.slug === slug)) {
      slug = `${slug}-${randomUUID().slice(0, 6)}`;
    }
    const ts = nowIso();
    const org: Organization = {
      id: randomUUID(),
      name,
      slug,
      orgType: input.orgType ?? "workspace",
      parentOrgId: null,
      timezone: input.timezone ?? "UTC",
      locale: input.locale ?? "en-US",
      currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
      branding: { ...DEFAULT_BRANDING },
      createdAt: ts,
      updatedAt: ts,
    };
    this.orgs.set(org.id, org);
    const membership: Membership = {
      id: randomUUID(),
      orgId: org.id,
      userId: actor.id,
      role: "owner",
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    this.memberships.set(membership.id, membership);
    this.seedEntitlements(org.id);
    await this.audit(actor, org.id, "org.create", "organization", org.id, { name: org.name });
    return org;
  }

  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    if (this.platformAdmins.has(userId)) return [...this.orgs.values()];
    const orgIds = [...this.memberships.values()]
      .filter((m) => m.userId === userId && m.status === "active")
      .map((m) => m.orgId);
    return orgIds.map((id) => this.orgs.get(id)!).filter(Boolean);
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    return (
      [...this.memberships.values()].find(
        (m) => m.userId === userId && m.orgId === orgId && m.status === "active",
      ) ?? null
    );
  }

  async requirePermission(
    actor: SessionUser,
    orgId: string,
    permission: Parameters<typeof hasPermission>[1],
  ): Promise<Membership | null> {
    if (actor.isPlatformAdmin) return null;
    const membership = await this.getMembership(actor.id, orgId);
    if (!membership || !hasPermission(membership.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
    return membership;
  }

  async getOrganization(actor: SessionUser, orgId: string): Promise<Organization> {
    await this.requirePermission(actor, orgId, "org:read");
    const org = this.orgs.get(orgId);
    if (!org) throw new AuthError("Organization not found", "not_found");
    return org;
  }

  /** Cross-tenant probe used in tests — must fail when actor is not a member. */
  async getOrganizationUncheckedForTests(orgId: string): Promise<Organization | null> {
    return this.orgs.get(orgId) ?? null;
  }

  async updateOrganizationSettings(
    actor: SessionUser,
    orgId: string,
    patch: Partial<Pick<Organization, "timezone" | "locale" | "currency" | "name">> & {
      branding?: Partial<OrgBranding>;
    },
  ): Promise<Organization> {
    await this.requirePermission(actor, orgId, "settings:write");
    const org = this.orgs.get(orgId);
    if (!org) throw new AuthError("Organization not found", "not_found");
    if (patch.branding) {
      await this.requirePermission(actor, orgId, "branding:write");
      org.branding = { ...org.branding, ...patch.branding };
    }
    if (patch.name) org.name = patch.name.trim();
    if (patch.timezone) org.timezone = patch.timezone;
    if (patch.locale) org.locale = patch.locale;
    if (patch.currency) org.currency = patch.currency.toUpperCase().slice(0, 3);
    org.updatedAt = nowIso();
    await this.audit(actor, orgId, "org.update_settings", "organization", orgId, patch as object);
    return org;
  }

  async listMembers(actor: SessionUser, orgId: string): Promise<Membership[]> {
    await this.requirePermission(actor, orgId, "members:read");
    return [...this.memberships.values()].filter((m) => m.orgId === orgId);
  }

  async createInvite(
    actor: SessionUser,
    orgId: string,
    email: string,
    role: MembershipRole,
  ): Promise<Invite> {
    await this.requirePermission(actor, orgId, "members:invite");
    if (role === "owner") throw new AuthError("Cannot invite as owner", "validation");
    const normalized = email.trim().toLowerCase();
    const token = randomBytes(24).toString("hex");
    const ts = nowIso();
    const invite: Invite & { tokenHash: string } = {
      id: randomUUID(),
      orgId,
      email: normalized,
      role,
      status: "pending",
      invitedByUserId: actor.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      createdAt: ts,
      tokenHash: hashToken(token),
      token,
    };
    this.invites.set(invite.id, invite);
    await this.audit(actor, orgId, "invite.create", "invite", invite.id, {
      email: normalized,
      role,
    });
    return invite;
  }

  async acceptInvite(actor: SessionUser, token: string): Promise<Membership> {
    const tokenHash = hashToken(token);
    const invite = [...this.invites.values()].find(
      (i) => i.tokenHash === tokenHash && i.status === "pending",
    );
    if (!invite) throw new AuthError("Invite not found", "not_found");
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      invite.status = "expired";
      throw new AuthError("Invite expired", "validation");
    }
    if (actor.email.toLowerCase() !== invite.email) {
      throw new AuthError("Invite email mismatch", "forbidden");
    }
    const existing = await this.getMembership(actor.id, invite.orgId);
    if (existing) {
      invite.status = "accepted";
      return existing;
    }
    const ts = nowIso();
    const membership: Membership = {
      id: randomUUID(),
      orgId: invite.orgId,
      userId: actor.id,
      role: invite.role,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    this.memberships.set(membership.id, membership);
    invite.status = "accepted";
    await this.audit(actor, invite.orgId, "invite.accept", "membership", membership.id, {
      role: invite.role,
    });
    return membership;
  }

  async listFlags(actor: SessionUser, orgId: string): Promise<FeatureFlag[]> {
    await this.requirePermission(actor, orgId, "flags:read");
    return [...this.flags.values()].filter((f) => f.orgId === orgId || f.orgId === null);
  }

  async setFlag(
    actor: SessionUser,
    orgId: string,
    key: string,
    enabled: boolean,
  ): Promise<FeatureFlag> {
    await this.requirePermission(actor, orgId, "flags:write");
    const id = `${orgId}:${key}`;
    const flag: FeatureFlag = {
      id,
      orgId,
      key,
      enabled,
      metadata: {},
    };
    this.flags.set(id, flag);
    await this.audit(actor, orgId, "flag.set", "feature_flag", null, { key, enabled });
    return flag;
  }

  async getEntitlements(
    actor: SessionUser,
    orgId: string,
  ): Promise<SubscriptionEntitlement | null> {
    await this.requirePermission(actor, orgId, "org:read");
    return this.entitlements.get(orgId) ?? null;
  }

  async listQuotas(actor: SessionUser, orgId: string): Promise<UsageQuota[]> {
    await this.requirePermission(actor, orgId, "org:read");
    return [...this.quotas.values()].filter((q) => q.orgId === orgId);
  }

  async listAudit(actor: SessionUser, orgId: string): Promise<AuditLogEntry[]> {
    await this.requirePermission(actor, orgId, "audit:read");
    return this.audits.filter((a) => a.orgId === orgId).slice(-200);
  }

  async grantPlatformAdmin(actor: SessionUser, userId: string, note?: string): Promise<void> {
    if (!actor.isPlatformAdmin) throw new AuthError("Platform admin required", "forbidden");
    this.platformAdmins.add(userId);
    await this.audit(actor, null, "platform.grant_admin", "platform_admin", userId, {
      note: note ?? null,
    });
  }

  async listAllOrgsAsPlatformAdmin(actor: SessionUser): Promise<Organization[]> {
    if (!actor.isPlatformAdmin) throw new AuthError("Platform admin required", "forbidden");
    return [...this.orgs.values()];
  }

  /** Bootstrap first local platform admin (dev only). */
  bootstrapPlatformAdmin(userId: string): void {
    this.platformAdmins.add(userId);
  }

  hasAnyPlatformAdmin(): boolean {
    return this.platformAdmins.size > 0;
  }

  /** Dev-only: first registered user becomes platform admin when none exist. */
  maybeBootstrapFirstPlatformAdmin(userId: string): void {
    if (!this.hasAnyPlatformAdmin()) {
      this.platformAdmins.add(userId);
    }
  }


  private seedEntitlements(orgId: string): void {
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    this.entitlements.set(orgId, {
      id: randomUUID(),
      orgId,
      planCode: "trial",
      status: "trialing",
      seatsIncluded: 3,
      features: {
        crm: true,
        campaigns: true,
        workflows: true,
        inbox: true,
        ai: true,
        analytics: true,
        white_label: false,
        real_estate: false,
        voice: false,
      },
      renewsAt: periodEnd.toISOString(),
    });
    for (const metric of ["leads_created", "ai_jobs", "messages_sent"] as const) {
      this.quotas.set(`${orgId}:${metric}`, {
        id: randomUUID(),
        orgId,
        metric,
        limitValue: metric === "leads_created" ? 1000 : 100,
        usedValue: 0,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }
    this.flags.set(`${orgId}:inbox_v1`, {
      id: `${orgId}:inbox_v1`,
      orgId,
      key: "inbox_v1",
      enabled: true,
      metadata: {},
    });
  }

  private async audit(
    actor: SessionUser,
    orgId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    payload: object,
  ): Promise<void> {
    this.audits.push({
      id: randomUUID(),
      orgId,
      actorUserId: actor.id,
      action,
      entityType,
      entityId,
      payload: payload as Record<string, unknown>,
      createdAt: nowIso(),
    });
  }

  private toSession(user: StoredUser): SessionUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isPlatformAdmin: this.platformAdmins.has(user.id),
    };
  }
}

/** Process-wide singleton for local auth mode (dev server). */
const globalStore = globalThis as typeof globalThis & {
  __leadorbitTenancyStore?: LocalTenancyStore;
};

export function getLocalTenancyStore(): LocalTenancyStore {
  if (!globalStore.__leadorbitTenancyStore) {
    globalStore.__leadorbitTenancyStore = new LocalTenancyStore();
  }
  return globalStore.__leadorbitTenancyStore;
}
