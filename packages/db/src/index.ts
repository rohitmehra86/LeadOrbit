import type { Lead, Organization } from "@leadorbit/domain";

/**
 * Repository ports. Supabase implementations land in Milestone 2+.
 * Keep I/O behind these interfaces so a future Spring Boot service
 * can reimplement the same contracts.
 */
export interface OrganizationRepository {
  listForUser(userId: string): Promise<Organization[]>;
  create(input: {
    name: string;
    slug: string;
    orgType: Organization["orgType"];
    ownerUserId: string;
  }): Promise<Organization>;
}

export interface LeadRepository {
  create(input: Omit<Lead, "id" | "score"> & { score?: number }): Promise<Lead>;
  getById(orgId: string, leadId: string): Promise<Lead | null>;
}

export class NotConfiguredError extends Error {
  constructor(resource: string) {
    super(
      `${resource} repository is not configured. Set Supabase credentials (Milestone 2).`,
    );
    this.name = "NotConfiguredError";
  }
}

export class StubOrganizationRepository implements OrganizationRepository {
  async listForUser(): Promise<Organization[]> {
    throw new NotConfiguredError("Organization");
  }

  async create(): Promise<Organization> {
    throw new NotConfiguredError("Organization");
  }
}

export class StubLeadRepository implements LeadRepository {
  async create(): Promise<Lead> {
    throw new NotConfiguredError("Lead");
  }

  async getById(): Promise<Lead | null> {
    throw new NotConfiguredError("Lead");
  }
}
