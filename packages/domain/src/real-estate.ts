/**
 * Milestone 9 — optional real-estate vertical.
 * Not hardcoded into core CRM; enabled per org as a module.
 */

export type InventoryStatus =
  | "available"
  | "held"
  | "booked"
  | "sold"
  | "blocked";

export type PropertyEnquiryStatus =
  | "new"
  | "matched"
  | "site_visit"
  | "negotiating"
  | "won"
  | "lost"
  | "closed";

export interface Developer {
  id: string;
  orgId: string;
  name: string;
  website: string | null;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RealEstateProject {
  id: string;
  orgId: string;
  developerId: string;
  name: string;
  location: string;
  city: string;
  status: "upcoming" | "under_construction" | "ready" | "completed";
  brochurePath: string | null;
  amenities: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  propertyType: string;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tower {
  id: string;
  orgId: string;
  propertyId: string;
  name: string;
  floors: number;
  createdAt: string;
}

export interface FloorPlan {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  bhk: number;
  carpetSqft: number | null;
  builtUpSqft: number | null;
  bathrooms: number | null;
  createdAt: string;
}

export interface Unit {
  id: string;
  orgId: string;
  projectId: string;
  propertyId: string;
  towerId: string | null;
  floorPlanId: string | null;
  unitNumber: string;
  floor: number | null;
  bhk: number;
  /** Authoritative list price — AI must not invent when null. */
  price: number | null;
  currency: string;
  status: InventoryStatus;
  facing: string | null;
  amenities: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Broker {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  firm: string | null;
  channelPartner: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerPreferences {
  id: string;
  orgId: string;
  leadId: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  locations: string[];
  bhkMin: number | null;
  bhkMax: number | null;
  propertyTypes: string[];
  mustHaveAmenities: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyEnquiry {
  id: string;
  orgId: string;
  leadId: string | null;
  projectId: string | null;
  unitId: string | null;
  brokerId: string | null;
  assigneeUserId: string | null;
  status: PropertyEnquiryStatus;
  source: string;
  message: string | null;
  preferenceId: string | null;
  siteVisitAppointmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnitMatch {
  unit: Unit;
  projectName: string;
  location: string;
  city: string;
  score: number;
  reasons: string[];
}

export interface EnquiryAnalytics {
  totalEnquiries: number;
  byStatus: Record<string, number>;
  withBroker: number;
  siteVisits: number;
  matchedUnits: number;
}

export interface MatchFilters {
  budgetMin?: number | null;
  budgetMax?: number | null;
  locations?: string[];
  bhk?: number | null;
  bhkMin?: number | null;
  bhkMax?: number | null;
  propertyTypes?: string[];
  status?: InventoryStatus | InventoryStatus[];
  amenities?: string[];
  projectId?: string | null;
}

/** Score a unit against buyer filters — higher is better. */
export function scoreUnitMatch(
  unit: {
    price: number | null;
    bhk: number;
    status: InventoryStatus;
    amenities: string[];
  },
  project: { location: string; city: string; name?: string },
  filters: MatchFilters,
): { score: number; reasons: string[]; eligible: boolean } {
  if (unit.status !== "available" && unit.status !== "held") {
    return { score: 0, reasons: [`Status ${unit.status}`], eligible: false };
  }

  let score = 10;
  const reasons: string[] = [];

  const statuses = filters.status
    ? Array.isArray(filters.status)
      ? filters.status
      : [filters.status]
    : null;
  if (statuses && !statuses.includes(unit.status)) {
    return { score: 0, reasons: ["Status filter miss"], eligible: false };
  }

  const bhkMin = filters.bhkMin ?? filters.bhk ?? null;
  const bhkMax = filters.bhkMax ?? filters.bhk ?? null;
  if (bhkMin != null && unit.bhk < bhkMin) {
    return { score: 0, reasons: ["BHK below minimum"], eligible: false };
  }
  if (bhkMax != null && unit.bhk > bhkMax) {
    return { score: 0, reasons: ["BHK above maximum"], eligible: false };
  }
  if (bhkMin != null || bhkMax != null || filters.bhk != null) {
    score += 25;
    reasons.push(`BHK ${unit.bhk} matches`);
  }

  if (unit.price == null) {
    reasons.push("Price on request (not listed)");
  } else {
    if (filters.budgetMax != null && unit.price > filters.budgetMax) {
      return { score: 0, reasons: ["Over budget"], eligible: false };
    }
    if (filters.budgetMin != null && unit.price < filters.budgetMin) {
      // still eligible but lower score
      score += 5;
      reasons.push("Below budget floor");
    } else {
      score += 30;
      reasons.push(`Listed price ${unit.price} in budget`);
    }
  }

  const locs = (filters.locations ?? []).map((l) => l.toLowerCase());
  if (locs.length > 0) {
    const hay = `${project.location} ${project.city}`.toLowerCase();
    const hit = locs.some((l) => hay.includes(l));
    if (!hit) {
      return { score: 0, reasons: ["Location miss"], eligible: false };
    }
    score += 20;
    reasons.push("Location match");
  }

  if (filters.amenities?.length) {
    const have = new Set(unit.amenities.map((a) => a.toLowerCase()));
    let hits = 0;
    for (const a of filters.amenities) {
      if (have.has(a.toLowerCase())) hits++;
    }
    if (hits === 0) {
      return { score: 0, reasons: ["Amenity miss"], eligible: false };
    }
    score += Math.min(15, hits * 5);
    reasons.push(`${hits} amenity match(es)`);
  }

  if (unit.status === "available") {
    score += 10;
    reasons.push("Available inventory");
  }

  return { score: Math.min(100, score), reasons, eligible: true };
}

export function rankUnitMatches(
  candidates: UnitMatch[],
  limit = 20,
): UnitMatch[] {
  return [...candidates].sort((a, b) => b.score - a.score).slice(0, limit);
}
