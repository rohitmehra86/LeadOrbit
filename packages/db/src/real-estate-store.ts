import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  hasPermission,
  listIndustryTemplates,
  rankUnitMatches,
  scoreUnitMatch,
  type BuyerPreferences,
  type Broker,
  type Developer,
  type EnquiryAnalytics,
  type FloorPlan,
  type IndustryTemplateId,
  type InventoryStatus,
  type MatchFilters,
  type Property,
  type PropertyEnquiry,
  type PropertyEnquiryStatus,
  type RealEstateProject,
  type Tower,
  type Unit,
  type UnitMatch,
} from "@leadorbit/domain";
import { AuthError, type LocalTenancyStore, type SessionUser } from "./tenancy-store";
import { getCrmDatabase } from "./sqlite";
import type { CalendarStore } from "./calendar-store";

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

const MODULE_KEY = "real_estate";

/**
 * Optional real-estate vertical. Core CRM does not depend on this store.
 * Enable per org via org_vertical_modules.
 */
export class RealEstateStore {
  constructor(
    private tenancy: LocalTenancyStore,
    private db: DatabaseSync = getCrmDatabase(),
    private calendar: CalendarStore | null = null,
  ) {}

  setCalendarStore(calendar: CalendarStore): void {
    this.calendar = calendar;
  }

  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "realestate:read" | "realestate:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await this.tenancy.getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  async isModuleEnabled(actor: SessionUser, orgId: string): Promise<boolean> {
    await this.gate(actor, orgId, "realestate:read");
    const row = this.db
      .prepare(
        `select enabled from org_vertical_modules where org_id=? and module_key=?`,
      )
      .get(orgId, MODULE_KEY) as { enabled: number } | undefined;
    return Boolean(row?.enabled);
  }

  /** Internal check without permission (used by AI hook). */
  isEnabled(orgId: string): boolean {
    const row = this.db
      .prepare(
        `select enabled from org_vertical_modules where org_id=? and module_key=?`,
      )
      .get(orgId, MODULE_KEY) as { enabled: number } | undefined;
    return Boolean(row?.enabled);
  }

  async setModuleEnabled(
    actor: SessionUser,
    orgId: string,
    enabled: boolean,
  ): Promise<{ moduleKey: string; enabled: boolean }> {
    await this.gate(actor, orgId, "realestate:write");
    this.db
      .prepare(
        `insert into org_vertical_modules(org_id, module_key, enabled, config, updated_at)
         values (?,?,?, '{}',?)
         on conflict(org_id, module_key) do update set enabled=excluded.enabled, updated_at=excluded.updated_at`,
      )
      .run(orgId, MODULE_KEY, enabled ? 1 : 0, nowIso());
    return { moduleKey: MODULE_KEY, enabled };
  }

  private requireEnabled(orgId: string): void {
    if (!this.isEnabled(orgId)) {
      throw new AuthError(
        "Real estate module is not enabled for this organization",
        "validation",
      );
    }
  }

  async listIndustryTemplates(actor: SessionUser, orgId: string) {
    await this.gate(actor, orgId, "realestate:read");
    const selected = this.db
      .prepare(
        `select template_id from org_industry_templates where org_id=? and selected=1`,
      )
      .all(orgId) as Array<{ template_id: string }>;
    const selectedSet = new Set(selected.map((s) => s.template_id));
    return listIndustryTemplates().map((t) => ({
      ...t,
      selected: selectedSet.has(t.id),
      moduleEnabled:
        t.moduleKey === MODULE_KEY ? this.isEnabled(orgId) : null,
    }));
  }

  async selectIndustryTemplate(
    actor: SessionUser,
    orgId: string,
    templateId: IndustryTemplateId,
  ): Promise<void> {
    await this.gate(actor, orgId, "realestate:write");
    this.db
      .prepare(
        `insert into org_industry_templates(org_id, template_id, selected, config, updated_at)
         values (?,?,1,'{}',?)
         on conflict(org_id, template_id) do update set selected=1, updated_at=excluded.updated_at`,
      )
      .run(orgId, templateId, nowIso());
    if (templateId === "real_estate") {
      await this.setModuleEnabled(actor, orgId, true);
    }
  }

  // --- CRUD helpers ---

  async createDeveloper(
    actor: SessionUser,
    orgId: string,
    input: { name: string; website?: string | null; contactEmail?: string | null },
  ): Promise<Developer> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_developers(id, org_id, name, website, contact_email, created_at, updated_at)
         values (?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.website ?? null,
        input.contactEmail ?? null,
        now,
        now,
      );
    return {
      id,
      orgId,
      name: input.name,
      website: input.website ?? null,
      contactEmail: input.contactEmail ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listDevelopers(actor: SessionUser, orgId: string): Promise<Developer[]> {
    await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const rows = this.db
      .prepare(`select * from re_developers where org_id=? order by name`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      website: r.website ? String(r.website) : null,
      contactEmail: r.contact_email ? String(r.contact_email) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createProject(
    actor: SessionUser,
    orgId: string,
    input: {
      developerId: string;
      name: string;
      location: string;
      city: string;
      status?: RealEstateProject["status"];
      brochurePath?: string | null;
      amenities?: string[];
    },
  ): Promise<RealEstateProject> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const dev = this.db
      .prepare(`select id from re_developers where org_id=? and id=?`)
      .get(orgId, input.developerId);
    if (!dev) throw new AuthError("Developer not found", "not_found");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_projects(
          id, org_id, developer_id, name, location, city, status, brochure_path, amenities, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.developerId,
        input.name,
        input.location,
        input.city,
        input.status ?? "under_construction",
        input.brochurePath ?? null,
        JSON.stringify(input.amenities ?? []),
        now,
        now,
      );
    return this.mapProject(
      this.db.prepare(`select * from re_projects where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  private mapProject(r: Record<string, unknown>): RealEstateProject {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      developerId: String(r.developer_id),
      name: String(r.name),
      location: String(r.location),
      city: String(r.city),
      status: r.status as RealEstateProject["status"],
      brochurePath: r.brochure_path ? String(r.brochure_path) : null,
      amenities: jparse(String(r.amenities ?? "[]"), []),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listProjects(
    actor: SessionUser,
    orgId: string,
  ): Promise<RealEstateProject[]> {
    await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const rows = this.db
      .prepare(`select * from re_projects where org_id=? order by name`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapProject(r));
  }

  async createProperty(
    actor: SessionUser,
    orgId: string,
    input: {
      projectId: string;
      name: string;
      propertyType: string;
      address?: string | null;
    },
  ): Promise<Property> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const proj = this.db
      .prepare(`select id from re_projects where org_id=? and id=?`)
      .get(orgId, input.projectId);
    if (!proj) throw new AuthError("Project not found", "not_found");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_properties(id, org_id, project_id, name, property_type, address, created_at, updated_at)
         values (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.projectId,
        input.name,
        input.propertyType,
        input.address ?? null,
        now,
        now,
      );
    return {
      id,
      orgId,
      projectId: input.projectId,
      name: input.name,
      propertyType: input.propertyType,
      address: input.address ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async createTower(
    actor: SessionUser,
    orgId: string,
    input: { propertyId: string; name: string; floors?: number },
  ): Promise<Tower> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const prop = this.db
      .prepare(`select id from re_properties where org_id=? and id=?`)
      .get(orgId, input.propertyId);
    if (!prop) throw new AuthError("Property not found", "not_found");
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_towers(id, org_id, property_id, name, floors, created_at)
         values (?,?,?,?,?,?)`,
      )
      .run(id, orgId, input.propertyId, input.name, input.floors ?? 0, now);
    return {
      id,
      orgId,
      propertyId: input.propertyId,
      name: input.name,
      floors: input.floors ?? 0,
      createdAt: now,
    };
  }

  async createFloorPlan(
    actor: SessionUser,
    orgId: string,
    input: {
      projectId: string;
      name: string;
      bhk: number;
      carpetSqft?: number | null;
      builtUpSqft?: number | null;
      bathrooms?: number | null;
    },
  ): Promise<FloorPlan> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_floor_plans(id, org_id, project_id, name, bhk, carpet_sqft, built_up_sqft, bathrooms, created_at)
         values (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.projectId,
        input.name,
        input.bhk,
        input.carpetSqft ?? null,
        input.builtUpSqft ?? null,
        input.bathrooms ?? null,
        now,
      );
    return {
      id,
      orgId,
      projectId: input.projectId,
      name: input.name,
      bhk: input.bhk,
      carpetSqft: input.carpetSqft ?? null,
      builtUpSqft: input.builtUpSqft ?? null,
      bathrooms: input.bathrooms ?? null,
      createdAt: now,
    };
  }

  private mapUnit(r: Record<string, unknown>): Unit {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      projectId: String(r.project_id),
      propertyId: String(r.property_id),
      towerId: r.tower_id ? String(r.tower_id) : null,
      floorPlanId: r.floor_plan_id ? String(r.floor_plan_id) : null,
      unitNumber: String(r.unit_number),
      floor: r.floor == null ? null : Number(r.floor),
      bhk: Number(r.bhk),
      price: r.price == null ? null : Number(r.price),
      currency: String(r.currency),
      status: r.status as InventoryStatus,
      facing: r.facing ? String(r.facing) : null,
      amenities: jparse(String(r.amenities ?? "[]"), []),
      metadata: jparse(String(r.metadata ?? "{}"), {}),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async createUnit(
    actor: SessionUser,
    orgId: string,
    input: {
      projectId: string;
      propertyId: string;
      towerId?: string | null;
      floorPlanId?: string | null;
      unitNumber: string;
      floor?: number | null;
      bhk: number;
      price?: number | null;
      currency?: string;
      status?: InventoryStatus;
      facing?: string | null;
      amenities?: string[];
    },
  ): Promise<Unit> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_units(
          id, org_id, project_id, property_id, tower_id, floor_plan_id, unit_number, floor, bhk,
          price, currency, status, facing, amenities, metadata, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?, '{}',?,?)`,
      )
      .run(
        id,
        orgId,
        input.projectId,
        input.propertyId,
        input.towerId ?? null,
        input.floorPlanId ?? null,
        input.unitNumber,
        input.floor ?? null,
        input.bhk,
        input.price ?? null,
        input.currency ?? "INR",
        input.status ?? "available",
        input.facing ?? null,
        JSON.stringify(input.amenities ?? []),
        now,
        now,
      );
    return this.mapUnit(
      this.db.prepare(`select * from re_units where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
  }

  async listUnits(actor: SessionUser, orgId: string): Promise<Unit[]> {
    await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const rows = this.db
      .prepare(`select * from re_units where org_id=? order by unit_number`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapUnit(r));
  }

  async updateUnitStatus(
    actor: SessionUser,
    orgId: string,
    unitId: string,
    status: InventoryStatus,
  ): Promise<Unit> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const row = this.db
      .prepare(`select id from re_units where org_id=? and id=?`)
      .get(orgId, unitId);
    if (!row) throw new AuthError("Unit not found", "not_found");
    this.db
      .prepare(`update re_units set status=?, updated_at=? where id=?`)
      .run(status, nowIso(), unitId);
    return this.mapUnit(
      this.db.prepare(`select * from re_units where id=?`).get(unitId) as Record<
        string,
        unknown
      >,
    );
  }

  async createBroker(
    actor: SessionUser,
    orgId: string,
    input: {
      name: string;
      email?: string | null;
      phone?: string | null;
      firm?: string | null;
      channelPartner?: boolean;
    },
  ): Promise<Broker> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `insert into re_brokers(id, org_id, name, email, phone, firm, channel_partner, active, created_at, updated_at)
         values (?,?,?,?,?,?,?,1,?,?)`,
      )
      .run(
        id,
        orgId,
        input.name,
        input.email ?? null,
        input.phone ?? null,
        input.firm ?? null,
        input.channelPartner ? 1 : 0,
        now,
        now,
      );
    return {
      id,
      orgId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      firm: input.firm ?? null,
      channelPartner: Boolean(input.channelPartner),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listBrokers(actor: SessionUser, orgId: string): Promise<Broker[]> {
    await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const rows = this.db
      .prepare(`select * from re_brokers where org_id=? order by name`)
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      email: r.email ? String(r.email) : null,
      phone: r.phone ? String(r.phone) : null,
      firm: r.firm ? String(r.firm) : null,
      channelPartner: Boolean(r.channel_partner),
      active: Boolean(r.active),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async upsertBuyerPreferences(
    actor: SessionUser,
    orgId: string,
    input: {
      id?: string;
      leadId?: string | null;
      budgetMin?: number | null;
      budgetMax?: number | null;
      locations?: string[];
      bhkMin?: number | null;
      bhkMax?: number | null;
      propertyTypes?: string[];
      mustHaveAmenities?: string[];
      notes?: string | null;
    },
  ): Promise<BuyerPreferences> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const now = nowIso();
    if (input.id) {
      const existing = this.db
        .prepare(`select id from re_buyer_preferences where org_id=? and id=?`)
        .get(orgId, input.id);
      if (!existing) throw new AuthError("Preferences not found", "not_found");
      this.db
        .prepare(
          `update re_buyer_preferences set lead_id=?, budget_min=?, budget_max=?, locations=?,
           bhk_min=?, bhk_max=?, property_types=?, must_have_amenities=?, notes=?, updated_at=?
           where id=?`,
        )
        .run(
          input.leadId ?? null,
          input.budgetMin ?? null,
          input.budgetMax ?? null,
          JSON.stringify(input.locations ?? []),
          input.bhkMin ?? null,
          input.bhkMax ?? null,
          JSON.stringify(input.propertyTypes ?? []),
          JSON.stringify(input.mustHaveAmenities ?? []),
          input.notes ?? null,
          now,
          input.id,
        );
      return this.mapPrefs(
        this.db
          .prepare(`select * from re_buyer_preferences where id=?`)
          .get(input.id) as Record<string, unknown>,
      );
    }
    const id = randomUUID();
    this.db
      .prepare(
        `insert into re_buyer_preferences(
          id, org_id, lead_id, budget_min, budget_max, locations, bhk_min, bhk_max,
          property_types, must_have_amenities, notes, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        orgId,
        input.leadId ?? null,
        input.budgetMin ?? null,
        input.budgetMax ?? null,
        JSON.stringify(input.locations ?? []),
        input.bhkMin ?? null,
        input.bhkMax ?? null,
        JSON.stringify(input.propertyTypes ?? []),
        JSON.stringify(input.mustHaveAmenities ?? []),
        input.notes ?? null,
        now,
        now,
      );
    return this.mapPrefs(
      this.db
        .prepare(`select * from re_buyer_preferences where id=?`)
        .get(id) as Record<string, unknown>,
    );
  }

  private mapPrefs(r: Record<string, unknown>): BuyerPreferences {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      leadId: r.lead_id ? String(r.lead_id) : null,
      budgetMin: r.budget_min == null ? null : Number(r.budget_min),
      budgetMax: r.budget_max == null ? null : Number(r.budget_max),
      locations: jparse(String(r.locations ?? "[]"), []),
      bhkMin: r.bhk_min == null ? null : Number(r.bhk_min),
      bhkMax: r.bhk_max == null ? null : Number(r.bhk_max),
      propertyTypes: jparse(String(r.property_types ?? "[]"), []),
      mustHaveAmenities: jparse(String(r.must_have_amenities ?? "[]"), []),
      notes: r.notes ? String(r.notes) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  /**
   * Inventory search / property matching — strictly org-scoped.
   */
  async matchInventory(
    actor: SessionUser | null,
    orgId: string,
    filters: MatchFilters,
    limit = 20,
  ): Promise<UnitMatch[]> {
    if (actor) await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const units = this.db
      .prepare(`select * from re_units where org_id=?`)
      .all(orgId) as Record<string, unknown>[];
    const projects = new Map(
      (
        this.db
          .prepare(`select * from re_projects where org_id=?`)
          .all(orgId) as Record<string, unknown>[]
      ).map((p) => [String(p.id), this.mapProject(p)]),
    );

    const matches: UnitMatch[] = [];
    for (const row of units) {
      const unit = this.mapUnit(row);
      if (unit.orgId !== orgId) continue; // defense-in-depth
      if (filters.projectId && unit.projectId !== filters.projectId) continue;
      const project = projects.get(unit.projectId);
      if (!project || project.orgId !== orgId) continue;
      const scored = scoreUnitMatch(unit, project, filters);
      if (!scored.eligible) continue;
      matches.push({
        unit,
        projectName: project.name,
        location: project.location,
        city: project.city,
        score: scored.score,
        reasons: scored.reasons,
      });
    }
    return rankUnitMatches(matches, limit);
  }

  /** Authoritative unit prices for AI — empty when module disabled. */
  lookupUnitsForAi(orgId: string, query: string, limit = 5): Array<{
    name: string;
    price: number | null;
    availability: string | null;
  }> {
    if (!this.isEnabled(orgId)) return [];
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2)
      .slice(0, 8);
    const units = this.db
      .prepare(`select * from re_units where org_id=? and status in ('available','held')`)
      .all(orgId) as Record<string, unknown>[];
    const projects = new Map(
      (
        this.db
          .prepare(`select id, name, location, city from re_projects where org_id=?`)
          .all(orgId) as Record<string, unknown>[]
      ).map((p) => [String(p.id), p]),
    );
    const scored = units
      .map((r) => {
        const unit = this.mapUnit(r);
        const p = projects.get(unit.projectId);
        const hay =
          `${unit.unitNumber} ${unit.bhk}bhk ${p?.name ?? ""} ${p?.location ?? ""} ${p?.city ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of tokens) if (hay.includes(t)) score++;
        return { unit, p, score };
      })
      .filter((x) => x.score > 0 || tokens.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((x) => ({
      name: `${x.p?.name ?? "Project"} · Unit ${x.unit.unitNumber} (${x.unit.bhk}BHK)`,
      price: x.unit.price,
      availability: x.unit.status,
    }));
  }

  async createEnquiry(
    actor: SessionUser,
    orgId: string,
    input: {
      leadId?: string | null;
      projectId?: string | null;
      unitId?: string | null;
      brokerId?: string | null;
      assigneeUserId?: string | null;
      source?: string;
      message?: string | null;
      preferenceId?: string | null;
      autoMatch?: boolean;
    },
  ): Promise<{ enquiry: PropertyEnquiry; matches: UnitMatch[] }> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    const id = randomUUID();
    const now = nowIso();
    let status: PropertyEnquiryStatus = "new";
    let matches: UnitMatch[] = [];
    if (input.autoMatch && input.preferenceId) {
      const pref = this.db
        .prepare(`select * from re_buyer_preferences where org_id=? and id=?`)
        .get(orgId, input.preferenceId) as Record<string, unknown> | undefined;
      if (pref) {
        const p = this.mapPrefs(pref);
        matches = await this.matchInventory(actor, orgId, {
          budgetMin: p.budgetMin,
          budgetMax: p.budgetMax,
          locations: p.locations,
          bhkMin: p.bhkMin,
          bhkMax: p.bhkMax,
          amenities: p.mustHaveAmenities,
        });
        if (matches.length > 0) status = "matched";
      }
    }
    // Agent routing: round-robin-ish — assign to actor if not set
    const assignee = input.assigneeUserId ?? actor.id;
    this.db
      .prepare(
        `insert into re_enquiries(
          id, org_id, lead_id, project_id, unit_id, broker_id, assignee_user_id, status, source,
          message, preference_id, site_visit_appointment_id, created_at, updated_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,null,?,?)`,
      )
      .run(
        id,
        orgId,
        input.leadId ?? null,
        input.projectId ?? null,
        input.unitId ?? matches[0]?.unit.id ?? null,
        input.brokerId ?? null,
        assignee,
        status,
        input.source ?? "manual",
        input.message ?? null,
        input.preferenceId ?? null,
        now,
        now,
      );
    const enquiry = this.mapEnquiry(
      this.db.prepare(`select * from re_enquiries where id=?`).get(id) as Record<
        string,
        unknown
      >,
    );
    return { enquiry, matches };
  }

  private mapEnquiry(r: Record<string, unknown>): PropertyEnquiry {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      leadId: r.lead_id ? String(r.lead_id) : null,
      projectId: r.project_id ? String(r.project_id) : null,
      unitId: r.unit_id ? String(r.unit_id) : null,
      brokerId: r.broker_id ? String(r.broker_id) : null,
      assigneeUserId: r.assignee_user_id ? String(r.assignee_user_id) : null,
      status: r.status as PropertyEnquiryStatus,
      source: String(r.source),
      message: r.message ? String(r.message) : null,
      preferenceId: r.preference_id ? String(r.preference_id) : null,
      siteVisitAppointmentId: r.site_visit_appointment_id
        ? String(r.site_visit_appointment_id)
        : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async listEnquiries(
    actor: SessionUser,
    orgId: string,
  ): Promise<PropertyEnquiry[]> {
    await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const rows = this.db
      .prepare(
        `select * from re_enquiries where org_id=? order by created_at desc limit 200`,
      )
      .all(orgId) as Record<string, unknown>[];
    return rows.map((r) => this.mapEnquiry(r));
  }

  async scheduleSiteVisit(
    actor: SessionUser,
    orgId: string,
    input: {
      enquiryId: string;
      appointmentTypeId: string;
      startsAt: string;
      siteVisitAddress: string;
    },
  ): Promise<{ enquiry: PropertyEnquiry; appointmentId: string }> {
    await this.gate(actor, orgId, "realestate:write");
    this.requireEnabled(orgId);
    if (!this.calendar) {
      throw new AuthError("Calendar store not configured", "validation");
    }
    const row = this.db
      .prepare(`select * from re_enquiries where org_id=? and id=?`)
      .get(orgId, input.enquiryId) as Record<string, unknown> | undefined;
    if (!row) throw new AuthError("Enquiry not found", "not_found");
    const enquiry = this.mapEnquiry(row);
    const appt = await this.calendar.bookAppointment(actor, orgId, {
      appointmentTypeId: input.appointmentTypeId,
      leadId: enquiry.leadId,
      assigneeUserId: enquiry.assigneeUserId ?? actor.id,
      startsAt: input.startsAt,
      siteVisitAddress: input.siteVisitAddress,
      title: "Property site visit",
      notes: `Enquiry ${enquiry.id}`,
    });
    this.db
      .prepare(
        `update re_enquiries set site_visit_appointment_id=?, status='site_visit', updated_at=? where id=?`,
      )
      .run(appt.id, nowIso(), enquiry.id);
    return {
      enquiry: this.mapEnquiry(
        this.db
          .prepare(`select * from re_enquiries where id=?`)
          .get(enquiry.id) as Record<string, unknown>,
      ),
      appointmentId: appt.id,
    };
  }

  async analytics(actor: SessionUser, orgId: string): Promise<EnquiryAnalytics> {
    await this.gate(actor, orgId, "realestate:read");
    this.requireEnabled(orgId);
    const items = await this.listEnquiries(actor, orgId);
    const byStatus: Record<string, number> = {};
    for (const e of items) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    }
    return {
      totalEnquiries: items.length,
      byStatus,
      withBroker: items.filter((e) => e.brokerId).length,
      siteVisits: items.filter((e) => e.siteVisitAppointmentId).length,
      matchedUnits: items.filter((e) => e.unitId).length,
    };
  }
}
