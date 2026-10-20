import { AuthError, type SessionUser } from "@leadorbit/db";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenancyStore } from "@/lib/tenancy/service";

const MODULE_KEY = "real_estate";

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuthError("Supabase is not configured", "validation");
  return supabase;
}

function asAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}

/**
 * Durable real-estate vertical for AUTH_MODE=supabase (Vercel).
 * Permissions: light membership check + Postgres RLS.
 */
export class SupabaseRealEstateStore {
  private async gate(
    actor: SessionUser,
    orgId: string,
    permission: "realestate:read" | "realestate:write",
  ): Promise<void> {
    if (actor.isPlatformAdmin) return;
    const m = await getTenancyStore().getMembership(actor.id, orgId);
    if (!m || !hasPermission(m.role, permission)) {
      throw new AuthError("Forbidden for this organization", "forbidden");
    }
  }

  private async enabled(orgId: string): Promise<boolean> {
    const supabase = await client();
    const { data } = await supabase
      .from("org_vertical_modules")
      .select("enabled")
      .eq("org_id", orgId)
      .eq("module_key", MODULE_KEY)
      .maybeSingle();
    return Boolean(data?.enabled);
  }

  private async requireEnabled(orgId: string): Promise<void> {
    if (!(await this.enabled(orgId))) {
      throw new AuthError(
        "Real estate module is not enabled for this organization",
        "validation",
      );
    }
  }

  async isModuleEnabled(actor: SessionUser, orgId: string): Promise<boolean> {
    await this.gate(actor, orgId, "realestate:read");
    return this.enabled(orgId);
  }

  isEnabled(orgId: string): boolean {
    // Sync AI hook — best-effort false; async path uses isModuleEnabled.
    void orgId;
    return false;
  }

  async setModuleEnabled(
    actor: SessionUser,
    orgId: string,
    enabled: boolean,
  ): Promise<{ moduleKey: string; enabled: boolean }> {
    await this.gate(actor, orgId, "realestate:write");
    const supabase = await client();
    const { error } = await supabase.from("org_vertical_modules").upsert(
      {
        org_id: orgId,
        module_key: MODULE_KEY,
        enabled,
        config: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,module_key" },
    );
    if (error) throw new AuthError(error.message, "validation");
    return { moduleKey: MODULE_KEY, enabled };
  }

  async listIndustryTemplates(actor: SessionUser, orgId: string) {
    await this.gate(actor, orgId, "realestate:read");
    const supabase = await client();
    const { data } = await supabase
      .from("org_industry_templates")
      .select("template_id")
      .eq("org_id", orgId)
      .eq("selected", true);
    const selectedSet = new Set((data ?? []).map((r) => String(r.template_id)));
    const moduleOn = await this.enabled(orgId);
    return listIndustryTemplates().map((t) => ({
      ...t,
      selected: selectedSet.has(t.id),
      moduleEnabled: t.moduleKey === MODULE_KEY ? moduleOn : null,
    }));
  }

  async selectIndustryTemplate(
    actor: SessionUser,
    orgId: string,
    templateId: IndustryTemplateId,
  ): Promise<void> {
    await this.gate(actor, orgId, "realestate:write");
    const supabase = await client();
    const { error } = await supabase.from("org_industry_templates").upsert(
      {
        org_id: orgId,
        template_id: templateId,
        selected: true,
        config: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,template_id" },
    );
    if (error) throw new AuthError(error.message, "validation");
    if (templateId === "real_estate") {
      await this.setModuleEnabled(actor, orgId, true);
    }
  }

  private mapDeveloper(r: Record<string, unknown>): Developer {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      website: r.website ? String(r.website) : null,
      contactEmail: r.contact_email ? String(r.contact_email) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
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
      amenities: asAmenities(r.amenities),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
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
      currency: String(r.currency ?? "INR"),
      status: r.status as InventoryStatus,
      facing: r.facing ? String(r.facing) : null,
      amenities: asAmenities(r.amenities),
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
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
      source: String(r.source ?? "manual"),
      message: r.message ? String(r.message) : null,
      preferenceId: r.preference_id ? String(r.preference_id) : null,
      siteVisitAppointmentId: r.site_visit_appointment_id
        ? String(r.site_visit_appointment_id)
        : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapPrefs(r: Record<string, unknown>): BuyerPreferences {
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      leadId: r.lead_id ? String(r.lead_id) : null,
      budgetMin: r.budget_min == null ? null : Number(r.budget_min),
      budgetMax: r.budget_max == null ? null : Number(r.budget_max),
      locations: asAmenities(r.locations),
      bhkMin: r.bhk_min == null ? null : Number(r.bhk_min),
      bhkMax: r.bhk_max == null ? null : Number(r.bhk_max),
      propertyTypes: asAmenities(r.property_types),
      mustHaveAmenities: asAmenities(r.must_have_amenities),
      notes: r.notes ? String(r.notes) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async createDeveloper(
    actor: SessionUser,
    orgId: string,
    input: { name: string; website?: string | null; contactEmail?: string | null },
  ): Promise<Developer> {
    await this.gate(actor, orgId, "realestate:write");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_developers")
      .insert({
        org_id: orgId,
        name: input.name,
        website: input.website ?? null,
        contact_email: input.contactEmail ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return this.mapDeveloper(data as Record<string, unknown>);
  }

  async listDevelopers(actor: SessionUser, orgId: string): Promise<Developer[]> {
    await this.gate(actor, orgId, "realestate:read");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_developers")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => this.mapDeveloper(r));
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
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_projects")
      .insert({
        org_id: orgId,
        developer_id: input.developerId,
        name: input.name,
        location: input.location,
        city: input.city,
        status: input.status ?? "under_construction",
        brochure_path: input.brochurePath ?? null,
        amenities: input.amenities ?? [],
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return this.mapProject(data as Record<string, unknown>);
  }

  async listProjects(actor: SessionUser, orgId: string): Promise<RealEstateProject[]> {
    await this.gate(actor, orgId, "realestate:read");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_projects")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => this.mapProject(r));
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
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_properties")
      .insert({
        org_id: orgId,
        project_id: input.projectId,
        name: input.name,
        property_type: input.propertyType,
        address: input.address ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      projectId: String(r.project_id),
      name: String(r.name),
      propertyType: String(r.property_type),
      address: r.address ? String(r.address) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async createTower(
    actor: SessionUser,
    orgId: string,
    input: { propertyId: string; name: string; floors?: number },
  ): Promise<Tower> {
    await this.gate(actor, orgId, "realestate:write");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_towers")
      .insert({
        org_id: orgId,
        property_id: input.propertyId,
        name: input.name,
        floors: input.floors ?? 0,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      propertyId: String(r.property_id),
      name: String(r.name),
      floors: Number(r.floors ?? 0),
      createdAt: String(r.created_at),
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
    },
  ): Promise<FloorPlan> {
    await this.gate(actor, orgId, "realestate:write");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_floor_plans")
      .insert({
        org_id: orgId,
        project_id: input.projectId,
        name: input.name,
        bhk: input.bhk,
        carpet_sqft: input.carpetSqft ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      projectId: String(r.project_id),
      name: String(r.name),
      bhk: Number(r.bhk),
      carpetSqft: r.carpet_sqft == null ? null : Number(r.carpet_sqft),
      builtUpSqft: r.built_up_sqft == null ? null : Number(r.built_up_sqft),
      bathrooms: r.bathrooms == null ? null : Number(r.bathrooms),
      createdAt: String(r.created_at),
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
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_units")
      .insert({
        org_id: orgId,
        project_id: input.projectId,
        property_id: input.propertyId,
        tower_id: input.towerId ?? null,
        floor_plan_id: input.floorPlanId ?? null,
        unit_number: input.unitNumber,
        floor: input.floor ?? null,
        bhk: input.bhk,
        price: input.price ?? null,
        currency: input.currency ?? "INR",
        status: input.status ?? "available",
        facing: input.facing ?? null,
        amenities: input.amenities ?? [],
        metadata: {},
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return this.mapUnit(data as Record<string, unknown>);
  }

  async listUnits(actor: SessionUser, orgId: string): Promise<Unit[]> {
    await this.gate(actor, orgId, "realestate:read");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_units")
      .select("*")
      .eq("org_id", orgId)
      .order("unit_number");
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => this.mapUnit(r));
  }

  async updateUnitStatus(
    actor: SessionUser,
    orgId: string,
    unitId: string,
    status: InventoryStatus,
  ): Promise<Unit> {
    await this.gate(actor, orgId, "realestate:write");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_units")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", unitId)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "not_found");
    return this.mapUnit(data as Record<string, unknown>);
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
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_brokers")
      .insert({
        org_id: orgId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        firm: input.firm ?? null,
        channel_partner: Boolean(input.channelPartner),
        active: true,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    const r = data as Record<string, unknown>;
    return {
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
    };
  }

  async listBrokers(actor: SessionUser, orgId: string): Promise<Broker[]> {
    await this.gate(actor, orgId, "realestate:read");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_brokers")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
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
    await this.requireEnabled(orgId);
    const supabase = await client();
    const row = {
      org_id: orgId,
      lead_id: input.leadId ?? null,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      locations: input.locations ?? [],
      bhk_min: input.bhkMin ?? null,
      bhk_max: input.bhkMax ?? null,
      property_types: input.propertyTypes ?? [],
      must_have_amenities: input.mustHaveAmenities ?? [],
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (input.id) {
      const { data, error } = await supabase
        .from("re_buyer_preferences")
        .update(row)
        .eq("org_id", orgId)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw new AuthError(error.message, "not_found");
      return this.mapPrefs(data as Record<string, unknown>);
    }
    const { data, error } = await supabase
      .from("re_buyer_preferences")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return this.mapPrefs(data as Record<string, unknown>);
  }

  async matchInventory(
    actor: SessionUser | null,
    orgId: string,
    filters: MatchFilters,
    limit = 20,
  ): Promise<UnitMatch[]> {
    if (actor) await this.gate(actor, orgId, "realestate:read");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const [{ data: unitRows, error: uErr }, { data: projectRows, error: pErr }] =
      await Promise.all([
        supabase.from("re_units").select("*").eq("org_id", orgId),
        supabase.from("re_projects").select("*").eq("org_id", orgId),
      ]);
    if (uErr) throw new AuthError(uErr.message, "validation");
    if (pErr) throw new AuthError(pErr.message, "validation");
    const projectMap = new Map(
      ((projectRows ?? []) as Record<string, unknown>[]).map((p) => [
        String(p.id),
        this.mapProject(p),
      ]),
    );
    const matches: UnitMatch[] = [];
    for (const row of (unitRows ?? []) as Record<string, unknown>[]) {
      const unit = this.mapUnit(row);
      if (filters.projectId && unit.projectId !== filters.projectId) continue;
      const project = projectMap.get(unit.projectId);
      if (!project) continue;
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

  lookupUnitsForAi(orgId: string, query: string, limit = 5) {
    void orgId;
    void query;
    void limit;
    return [] as Array<{
      name: string;
      price: number | null;
      availability: string | null;
    }>;
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
    await this.requireEnabled(orgId);
    let status: PropertyEnquiryStatus = "new";
    let matches: UnitMatch[] = [];
    if (input.autoMatch && input.preferenceId) {
      const supabase = await client();
      const { data: pref } = await supabase
        .from("re_buyer_preferences")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", input.preferenceId)
        .maybeSingle();
      if (pref) {
        const p = this.mapPrefs(pref as Record<string, unknown>);
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
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_enquiries")
      .insert({
        org_id: orgId,
        lead_id: input.leadId ?? null,
        project_id: input.projectId ?? null,
        unit_id: input.unitId ?? matches[0]?.unit.id ?? null,
        broker_id: input.brokerId ?? null,
        assignee_user_id: input.assigneeUserId ?? actor.id,
        status,
        source: input.source ?? "manual",
        message: input.message ?? null,
        preference_id: input.preferenceId ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AuthError(error.message, "validation");
    return { enquiry: this.mapEnquiry(data as Record<string, unknown>), matches };
  }

  async listEnquiries(actor: SessionUser, orgId: string): Promise<PropertyEnquiry[]> {
    await this.gate(actor, orgId, "realestate:read");
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data, error } = await supabase
      .from("re_enquiries")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new AuthError(error.message, "validation");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => this.mapEnquiry(r));
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
    await this.requireEnabled(orgId);
    const supabase = await client();
    const { data: enqRow, error: enqErr } = await supabase
      .from("re_enquiries")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", input.enquiryId)
      .maybeSingle();
    if (enqErr || !enqRow) throw new AuthError("Enquiry not found", "not_found");
    const enquiry = this.mapEnquiry(enqRow as Record<string, unknown>);

    let typeId = input.appointmentTypeId;
    if (!typeId) {
      const { data: createdType, error: typeErr } = await supabase
        .from("appointment_types")
        .insert({
          org_id: orgId,
          name: "Site visit",
          kind: "site_visit",
          duration_minutes: 60,
          requires_site_visit: true,
          timezone: "Asia/Kolkata",
        })
        .select("id")
        .single();
      if (typeErr) throw new AuthError(typeErr.message, "validation");
      typeId = String(createdType.id);
    }

    const { data: typeRow } = await supabase
      .from("appointment_types")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", typeId)
      .maybeSingle();
    const duration = Number(typeRow?.duration_minutes ?? 60);
    const starts = new Date(input.startsAt);
    const ends = new Date(starts.getTime() + duration * 60_000);
    const bufferBefore = Number(typeRow?.buffer_before_minutes ?? 0);
    const bufferAfter = Number(typeRow?.buffer_after_minutes ?? 0);
    const blockedStart = new Date(starts.getTime() - bufferBefore * 60_000);
    const blockedEnd = new Date(ends.getTime() + bufferAfter * 60_000);

    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .insert({
        org_id: orgId,
        appointment_type_id: typeId,
        lead_id: enquiry.leadId,
        assignee_user_id: enquiry.assigneeUserId ?? actor.id,
        status: "scheduled",
        kind: "site_visit",
        title: "Property site visit",
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        timezone: String(typeRow?.timezone ?? "Asia/Kolkata"),
        buffer_before_minutes: bufferBefore,
        buffer_after_minutes: bufferAfter,
        blocked_start: blockedStart.toISOString(),
        blocked_end: blockedEnd.toISOString(),
        site_visit_address: input.siteVisitAddress,
        notes: `Enquiry ${enquiry.id}`,
      })
      .select("id")
      .single();
    if (apptErr) throw new AuthError(apptErr.message, "validation");

    const { data: updated, error: updErr } = await supabase
      .from("re_enquiries")
      .update({
        site_visit_appointment_id: appt.id,
        status: "site_visit",
        updated_at: new Date().toISOString(),
      })
      .eq("id", enquiry.id)
      .select("*")
      .single();
    if (updErr) throw new AuthError(updErr.message, "validation");
    return {
      enquiry: this.mapEnquiry(updated as Record<string, unknown>),
      appointmentId: String(appt.id),
    };
  }

  async analytics(actor: SessionUser, orgId: string): Promise<EnquiryAnalytics> {
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

  setCalendarStore(_calendar: unknown): void {
    // Site visits book directly into Supabase appointments.
  }
}

let singleton: SupabaseRealEstateStore | null = null;

export function getSupabaseRealEstateStore(): SupabaseRealEstateStore {
  if (!singleton) singleton = new SupabaseRealEstateStore();
  return singleton;
}
