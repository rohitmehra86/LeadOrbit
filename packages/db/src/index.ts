export {
  AuthError,
  LocalTenancyStore,
  getLocalTenancyStore,
  type SessionUser,
} from "./tenancy-store";

export { isSupabaseConfigured, getAuthMode } from "./config";
export { CrmStore } from "./crm-store";
export { CampaignStore } from "./campaign-store";
export { IngestionStore } from "./ingestion-store";
export { WorkflowStore } from "./workflow-store";
export { InboxStore } from "./inbox-store";
export { KnowledgeStore } from "./knowledge-store";
export { AiStore } from "./ai-store";
export { CalendarStore } from "./calendar-store";
export { VoiceStore } from "./voice-store";
export { RealEstateStore } from "./real-estate-store";
export { SqliteJobQueue, getJobQueue } from "./job-queue";
export { getCrmDatabase, openCrmDatabase, resetCrmDatabaseForTests } from "./sqlite";



import type { Lead, Organization } from "@leadorbit/domain";

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
      `${resource} repository is not configured. Set Supabase credentials.`,
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
