import { AuthError, type SessionUser } from "@leadorbit/db";
import type {
  AuditLogEntry,
  FeatureFlag,
  Invite,
  Membership,
  MembershipRole,
  Organization,
  OrgBranding,
  OrgType,
  SubscriptionEntitlement,
  UsageQuota,
} from "@leadorbit/domain";
import { hasPermission, slugifyOrgName } from "@leadorbit/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  parent_org_id: string | null;
  timezone: string;
  locale: string;
  currency: string;
  branding: OrgBranding | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  id: string;
  org_id: string;
  user_id: string;
  role: MembershipRole;
  status: Membership["status"];
  created_at: string;
  updated_at: string;
};

function mapOrg(row: OrgRow): Organization {
  const branding = (row.branding ?? {}) as Partial<OrgBranding>;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    orgType: row.org_type,
    parentOrgId: row.parent_org_id,
    timezone: row.timezone,
    locale: row.locale,
    currency: row.currency,
    branding: {
      logoUrl: branding.logoUrl ?? null,
      primaryColor: branding.primaryColor ?? null,
      accentColor: branding.accentColor ?? null,
      supportEmail: branding.supportEmail ?? null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new AuthError("Supabase is not configured", "validation");
  }
  return supabase;
}

/**
 * Supabase-backed tenancy for AUTH_MODE=supabase (Vercel staging/production).
 * Permission checks rely on RLS + light service-layer guards.
 */
export class SupabaseTenancyStore {
  async createOrganization(
    actor: SessionUser,
    input: {
      name: string;
      orgType?: OrgType;
      timezone?: string;
      locale?: string;
      currency?: string;
    },
  ): Promise<Organization> {
    const name = input.name.trim();
    if (name.length < 2) throw new AuthError("Organization name too short", "validation");
    const slug = slugifyOrgName(name) || `org-${actor.id.slice(0, 8)}`;
    const supabase = await client();
    const { data, error } = await supabase.rpc("create_organization_with_owner", {
      p_name: name,
      p_slug: slug,
      p_org_type: input.orgType ?? "workspace",
      p_timezone: input.timezone ?? "UTC",
      p_locale: input.locale ?? "en-US",
      p_currency: input.currency ?? "USD",
    });
    if (error) {
      if (error.message?.toLowerCase().includes("duplicate") || error.code === "23505") {
        throw new AuthError("Organization slug already exists", "conflict");
      }
      throw new AuthError(error.message || "Failed to create organization", "validation");
    }
    const row = (Array.isArray(data) ? data[0] : data) as OrgRow | null;
    if (!row) throw new AuthError("Failed to create organization", "validation");
    return mapOrg(row);
  }

  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    const supabase = await client();
    const { data: isAdmin } = await supabase.rpc("maybe_bootstrap_platform_admin");
    if (isAdmin) {
      const { data, error } = await supabase.from("organizations").select("*").order("created_at");
      if (error) throw new AuthError(error.message, "validation");
      return ((data ?? []) as OrgRow[]).map(mapOrg);
    }
    const { data: memberships, error: mErr } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (mErr) throw new AuthError(mErr.message, "validation");
    const orgIds = (memberships ?? []).map((m: { org_id: string }) => m.org_id);
    if (orgIds.length === 0) return [];
    const { data, error } = await supabase.from("organizations").select("*").in("id", orgIds);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as OrgRow[]).map(mapOrg);
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    const supabase = await client();
    const { data, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    return data ? mapMembership(data as MembershipRow) : null;
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
    const supabase = await client();
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    if (!data) throw new AuthError("Organization not found", "not_found");
    return mapOrg(data as OrgRow);
  }

  async updateOrganizationSettings(
    actor: SessionUser,
    orgId: string,
    patch: Partial<Pick<Organization, "timezone" | "locale" | "currency" | "name">> & {
      branding?: Partial<OrgBranding>;
    },
  ): Promise<Organization> {
    await this.requirePermission(actor, orgId, "settings:write");
    if (patch.branding) await this.requirePermission(actor, orgId, "branding:write");
    const supabase = await client();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name) updates.name = patch.name.trim();
    if (patch.timezone) updates.timezone = patch.timezone;
    if (patch.locale) updates.locale = patch.locale;
    if (patch.currency) updates.currency = patch.currency.toUpperCase().slice(0, 3);
    if (patch.branding) {
      const current = await this.getOrganization(actor, orgId);
      updates.branding = { ...current.branding, ...patch.branding };
    }
    const { data, error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", orgId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return mapOrg(data as OrgRow);
  }

  async listMembers(actor: SessionUser, orgId: string): Promise<Membership[]> {
    await this.requirePermission(actor, orgId, "members:read");
    const supabase = await client();
    const { data, error } = await supabase.from("memberships").select("*").eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as MembershipRow[]).map(mapMembership);
  }

  async createInvite(
    actor: SessionUser,
    orgId: string,
    email: string,
    role: MembershipRole,
  ): Promise<Invite> {
    await this.requirePermission(actor, orgId, "members:invite");
    if (role === "owner") throw new AuthError("Cannot invite as owner", "validation");
    throw new AuthError(
      "Invites via Supabase Auth email are not wired yet for staging.",
      "validation",
    );
  }

  async acceptInvite(_actor: SessionUser, _token: string): Promise<Membership> {
    throw new AuthError("Invite accept is not wired for Supabase mode yet", "validation");
  }

  async listFlags(actor: SessionUser, orgId: string): Promise<FeatureFlag[]> {
    await this.requirePermission(actor, orgId, "flags:read");
    const supabase = await client();
    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .or(`org_id.eq.${orgId},org_id.is.null`);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<{
      id: string;
      org_id: string | null;
      key: string;
      enabled: boolean;
      metadata: Record<string, unknown> | null;
    }>).map((f) => ({
      id: f.id,
      orgId: f.org_id,
      key: f.key,
      enabled: f.enabled,
      metadata: f.metadata ?? {},
    }));
  }

  async setFlag(
    actor: SessionUser,
    orgId: string,
    key: string,
    enabled: boolean,
  ): Promise<FeatureFlag> {
    await this.requirePermission(actor, orgId, "flags:write");
    const supabase = await client();
    const { data, error } = await supabase
      .from("feature_flags")
      .upsert(
        {
          org_id: orgId,
          key,
          enabled,
          metadata: {},
        },
        { onConflict: "org_id,key" },
      )
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return {
      id: data.id as string,
      orgId: data.org_id as string | null,
      key: data.key as string,
      enabled: Boolean(data.enabled),
      metadata: (data.metadata as Record<string, unknown>) ?? {},
    };
  }

  async getEntitlements(
    actor: SessionUser,
    orgId: string,
  ): Promise<SubscriptionEntitlement | null> {
    await this.requirePermission(actor, orgId, "org:read");
    const supabase = await client();
    const { data, error } = await supabase
      .from("subscription_entitlements")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw new AuthError(error.message, "validation");
    if (!data) return null;
    return {
      id: data.id,
      orgId: data.org_id,
      planCode: data.plan_code,
      status: data.status,
      seatsIncluded: data.seats_included,
      features: data.features ?? {},
      renewsAt: data.renews_at,
    } as SubscriptionEntitlement;
  }

  async listQuotas(actor: SessionUser, orgId: string): Promise<UsageQuota[]> {
    await this.requirePermission(actor, orgId, "org:read");
    const supabase = await client();
    const { data, error } = await supabase.from("usage_quotas").select("*").eq("org_id", orgId);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<{
      id: string;
      org_id: string;
      metric: UsageQuota["metric"];
      limit_value: number;
      used_value: number;
      period_start: string;
      period_end: string;
    }>).map((q) => ({
      id: q.id,
      orgId: q.org_id,
      metric: q.metric,
      limitValue: q.limit_value,
      usedValue: q.used_value,
      periodStart: q.period_start,
      periodEnd: q.period_end,
    }));
  }

  async listAudit(actor: SessionUser, orgId: string): Promise<AuditLogEntry[]> {
    await this.requirePermission(actor, orgId, "audit:read");
    const supabase = await client();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Array<{
      id: string;
      org_id: string | null;
      actor_user_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      payload: Record<string, unknown> | null;
      created_at: string;
    }>).map((a) => ({
      id: a.id,
      orgId: a.org_id,
      actorUserId: a.actor_user_id,
      action: a.action,
      entityType: a.entity_type,
      entityId: a.entity_id,
      payload: a.payload ?? {},
      createdAt: a.created_at,
    }));
  }

  async listAllOrgsAsPlatformAdmin(actor: SessionUser): Promise<Organization[]> {
    if (!actor.isPlatformAdmin) throw new AuthError("Platform admin required", "forbidden");
    const supabase = await client();
    const { data, error } = await supabase.from("organizations").select("*").order("created_at");
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as OrgRow[]).map(mapOrg);
  }
}

let singleton: SupabaseTenancyStore | undefined;

export function getSupabaseTenancyStore(): SupabaseTenancyStore {
  if (!singleton) singleton = new SupabaseTenancyStore();
  return singleton;
}
