import { CrmStore, getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { getSupabaseCrmStore, type SupabaseCrmStore } from "./supabase-crm";

const globalCrm = globalThis as typeof globalThis & { __leadorbitCrm?: CrmStore };

/** Local SQLite CRM (default for Advanced/Expert modules). */
export function getCrmStore(): CrmStore {
  if (!globalCrm.__leadorbitCrm) {
    globalCrm.__leadorbitCrm = new CrmStore(getLocalTenancyStore());
  }
  return globalCrm.__leadorbitCrm;
}

export type DomainCrmStore = CrmStore | SupabaseCrmStore;

/** Mode-aware CRM used by AI shell, Launch Pack, Leads/Results/Sales simple views. */
export function getDomainCrm(): DomainCrmStore {
  if (getAuthMode() === "supabase") return getSupabaseCrmStore();
  return getCrmStore();
}
