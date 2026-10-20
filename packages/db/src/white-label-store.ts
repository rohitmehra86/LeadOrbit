import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  featureAllowed,
  hasPermission,
  startDomainVerification,
  verifyDomainTxtChallenge,
  visibleFeatures,
  type AgencyManagedOrg,
  type CustomDomain,
  type DnsTxtLookup,
  type WhiteLabelBrand,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import type { BillingStore } from "./billing-store";

function nowIso(): string {
  return new Date().toISOString();
}

type BrandRow = {
  org_id: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  support_email: string | null;
  login_headline: string | null;
  email_from_name: string | null;
  email_footer: string | null;
  hide_leadorbit_branding: number;
  updated_at: string;
};

type DomainRow = {
  id: string;
  org_id: string;
  hostname: string;
  status: string;
  txt_challenge: string | null;
  detail: string;
  created_at: string;
  updated_at: string;
};

/**
 * White-label branding, custom domain verification scaffolding, agency management.
 * Feature visibility gated by subscription entitlements.
 */
export class WhiteLabelStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private billing: BillingStore | null = null,
  ) {}

  setBillingStore(billing: BillingStore): void {
    this.billing = billing;
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "white_label:read" | "white_label:write" | "branding:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private requireWhiteLabelEntitlement(orgId: string): void {
    if (!this.billing) return;
    try {
      this.billing.requireFeature(orgId, "white_label");
    } catch {
      throw new AuthError(
        "White-label feature not entitled on current plan",
        "forbidden",
      );
    }
  }

  private mapBrand(row: BrandRow): WhiteLabelBrand {
    return {
      orgId: row.org_id,
      logoUrl: row.logo_url,
      primaryColor: row.primary_color,
      accentColor: row.accent_color,
      supportEmail: row.support_email,
      loginHeadline: row.login_headline,
      emailFromName: row.email_from_name,
      emailFooter: row.email_footer,
      hideLeadOrbitBranding: Boolean(row.hide_leadorbit_branding),
      updatedAt: row.updated_at,
    };
  }

  private mapDomain(row: DomainRow): CustomDomain {
    return {
      id: row.id,
      orgId: row.org_id,
      hostname: row.hostname,
      status: row.status as CustomDomain["status"],
      txtChallenge: row.txt_challenge,
      detail: row.detail,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getBrand(actor: SessionUser, orgId: string): Promise<WhiteLabelBrand> {
    await this.gate(actor, orgId, "white_label:read");
    const row = this.db
      .prepare(`select * from white_label_brands where org_id=?`)
      .get(orgId) as BrandRow | undefined;
    if (row) return this.mapBrand(row);
    // Fallback from org branding in tenancy
    const org = await this.tenancy.getOrganization(actor, orgId);
    const now = nowIso();
    return {
      orgId,
      logoUrl: org.branding.logoUrl,
      primaryColor: org.branding.primaryColor,
      accentColor: org.branding.accentColor,
      supportEmail: org.branding.supportEmail,
      loginHeadline: null,
      emailFromName: null,
      emailFooter: null,
      hideLeadOrbitBranding: false,
      updatedAt: now,
    };
  }

  /** Public branded surface for login/pages/emails (no auth). */
  getPublicBrand(orgId: string): WhiteLabelBrand | null {
    const row = this.db
      .prepare(`select * from white_label_brands where org_id=?`)
      .get(orgId) as BrandRow | undefined;
    return row ? this.mapBrand(row) : null;
  }

  async updateBrand(
    actor: SessionUser,
    orgId: string,
    patch: Partial<{
      logoUrl: string | null;
      primaryColor: string | null;
      accentColor: string | null;
      supportEmail: string | null;
      loginHeadline: string | null;
      emailFromName: string | null;
      emailFooter: string | null;
      hideLeadOrbitBranding: boolean;
    }>,
  ): Promise<WhiteLabelBrand> {
    await this.gate(actor, orgId, "white_label:write");
    this.requireWhiteLabelEntitlement(orgId);
    const current = await this.getBrand(actor, orgId);
    const now = nowIso();
    const next: WhiteLabelBrand = {
      ...current,
      logoUrl: patch.logoUrl !== undefined ? patch.logoUrl : current.logoUrl,
      primaryColor:
        patch.primaryColor !== undefined
          ? patch.primaryColor
          : current.primaryColor,
      accentColor:
        patch.accentColor !== undefined ? patch.accentColor : current.accentColor,
      supportEmail:
        patch.supportEmail !== undefined
          ? patch.supportEmail
          : current.supportEmail,
      loginHeadline:
        patch.loginHeadline !== undefined
          ? patch.loginHeadline
          : current.loginHeadline,
      emailFromName:
        patch.emailFromName !== undefined
          ? patch.emailFromName
          : current.emailFromName,
      emailFooter:
        patch.emailFooter !== undefined ? patch.emailFooter : current.emailFooter,
      hideLeadOrbitBranding:
        patch.hideLeadOrbitBranding !== undefined
          ? patch.hideLeadOrbitBranding
          : current.hideLeadOrbitBranding,
      updatedAt: now,
    };
    this.db
      .prepare(
        `insert into white_label_brands(
          org_id, logo_url, primary_color, accent_color, support_email,
          login_headline, email_from_name, email_footer, hide_leadorbit_branding, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?)
        on conflict(org_id) do update set
          logo_url=excluded.logo_url,
          primary_color=excluded.primary_color,
          accent_color=excluded.accent_color,
          support_email=excluded.support_email,
          login_headline=excluded.login_headline,
          email_from_name=excluded.email_from_name,
          email_footer=excluded.email_footer,
          hide_leadorbit_branding=excluded.hide_leadorbit_branding,
          updated_at=excluded.updated_at`,
      )
      .run(
        orgId,
        next.logoUrl,
        next.primaryColor,
        next.accentColor,
        next.supportEmail,
        next.loginHeadline,
        next.emailFromName,
        next.emailFooter,
        next.hideLeadOrbitBranding ? 1 : 0,
        now,
      );
    // Mirror core branding fields onto org for existing settings UI
    await this.tenancy.updateOrganizationSettings(actor, orgId, {
      branding: {
        logoUrl: next.logoUrl,
        primaryColor: next.primaryColor,
        accentColor: next.accentColor,
        supportEmail: next.supportEmail,
      },
    });
    return next;
  }

  async listDomains(actor: SessionUser, orgId: string): Promise<CustomDomain[]> {
    await this.gate(actor, orgId, "white_label:read");
    const rows = this.db
      .prepare(`select * from custom_domains where org_id=? order by created_at desc`)
      .all(orgId) as DomainRow[];
    return rows.map((r) => this.mapDomain(r));
  }

  async addDomain(
    actor: SessionUser,
    orgId: string,
    hostname: string,
  ): Promise<CustomDomain> {
    await this.gate(actor, orgId, "white_label:write");
    this.requireWhiteLabelEntitlement(orgId);
    const started = startDomainVerification(hostname);
    if (started.status === "failed") {
      throw new AuthError(started.detail, "validation");
    }
    const id = randomUUID();
    const now = nowIso();
    try {
      this.db
        .prepare(
          `insert into custom_domains(
            id, org_id, hostname, status, txt_challenge, detail, created_at, updated_at
          ) values (?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          orgId,
          hostname.trim().toLowerCase(),
          started.status,
          started.txtChallenge,
          started.detail,
          now,
          now,
        );
    } catch {
      throw new AuthError("Domain already registered for this org", "conflict");
    }
    return this.mapDomain(
      this.db.prepare(`select * from custom_domains where id=?`).get(id) as DomainRow,
    );
  }

  /**
   * Re-check DNS TXT for a custom domain. Never marks verified without a match.
   */
  async verifyDomain(
    actor: SessionUser,
    orgId: string,
    domainId: string,
    lookup?: DnsTxtLookup,
  ): Promise<CustomDomain> {
    await this.gate(actor, orgId, "white_label:write");
    this.requireWhiteLabelEntitlement(orgId);
    const row = this.db
      .prepare(`select * from custom_domains where org_id=? and id=?`)
      .get(orgId, domainId) as DomainRow | undefined;
    if (!row) throw new AuthError("Domain not found", "not_found");
    const result = await verifyDomainTxtChallenge({
      hostname: row.hostname,
      expectedToken: row.txt_challenge ?? "",
      lookup,
    });
    const now = nowIso();
    this.db
      .prepare(
        `update custom_domains set status=?, detail=?, updated_at=? where id=?`,
      )
      .run(result.status, result.detail, now, domainId);
    return this.mapDomain(
      this.db.prepare(`select * from custom_domains where id=?`).get(domainId) as DomainRow,
    );
  }

  /** Public: resolve org id from a verified (or registered) custom hostname. */
  resolveOrgIdByHostname(hostname: string): string | null {
    const key = hostname.trim().toLowerCase().split(":")[0] ?? "";
    const row = this.db
      .prepare(
        `select org_id from custom_domains where hostname=? order by
           case status when 'verified' then 0 when 'pending' then 1 else 2 end
         limit 1`,
      )
      .get(key) as { org_id: string } | undefined;
    return row?.org_id ?? null;
  }

  async featureVisibility(
    actor: SessionUser,
    orgId: string,
  ): Promise<{ features: string[]; all: Record<string, boolean> }> {
    await this.gate(actor, orgId, "white_label:read");
    if (!this.billing) {
      return { features: [], all: {} };
    }
    const sub = await this.billing.getSubscription(actor, orgId);
    return {
      features: visibleFeatures(sub.features),
      all: sub.features,
    };
  }

  isFeatureVisible(orgId: string, feature: string): boolean {
    if (!this.billing) return false;
    const sub = this.billing.ensureTrialSubscription(orgId);
    return featureAllowed(sub.features, feature);
  }

  async listAgencyChildren(
    actor: SessionUser,
    agencyOrgId: string,
  ): Promise<AgencyManagedOrg[]> {
    await this.gate(actor, agencyOrgId, "white_label:read");
    const rows = this.db
      .prepare(
        `select * from agency_managed_orgs where agency_org_id=? order by created_at desc`,
      )
      .all(agencyOrgId) as Array<{
      id: string;
      agency_org_id: string;
      child_org_id: string;
      label: string | null;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      agencyOrgId: r.agency_org_id,
      childOrgId: r.child_org_id,
      label: r.label,
      createdAt: r.created_at,
    }));
  }

  async linkAgencyChild(
    actor: SessionUser,
    agencyOrgId: string,
    childOrgId: string,
    label?: string | null,
  ): Promise<AgencyManagedOrg> {
    await this.gate(actor, agencyOrgId, "white_label:write");
    this.requireWhiteLabelEntitlement(agencyOrgId);
    if (agencyOrgId === childOrgId) {
      throw new AuthError("Cannot link org to itself", "validation");
    }
    // Scaffold: require actor membership on child for demo safety
    const childMembership = await this.tenancy.getMembership(actor.id, childOrgId);
    if (!childMembership && !actor.isPlatformAdmin) {
      throw new AuthError("Must be member of child org to link", "forbidden");
    }
    const id = randomUUID();
    const now = nowIso();
    try {
      this.db
        .prepare(
          `insert into agency_managed_orgs(id, agency_org_id, child_org_id, label, created_at)
           values (?,?,?,?,?)`,
        )
        .run(id, agencyOrgId, childOrgId, label ?? null, now);
    } catch {
      throw new AuthError("Agency link already exists", "conflict");
    }
    return {
      id,
      agencyOrgId,
      childOrgId,
      label: label ?? null,
      createdAt: now,
    };
  }
}
