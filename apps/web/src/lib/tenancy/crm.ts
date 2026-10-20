import { CrmStore, getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { getSupabaseCrmStore, type SupabaseCrmStore } from "./supabase-crm";

const globalCrm = globalThis as typeof globalThis & { __leadorbitCrm?: CrmStore };

/** Mode-aware CRM: local SQLite or durable Supabase (cast for Advanced call sites). */
export function getCrmStore(): CrmStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseCrmStore() as unknown as CrmStore;
  }
  if (!globalCrm.__leadorbitCrm) {
    globalCrm.__leadorbitCrm = new CrmStore(getLocalTenancyStore());
  }
  return globalCrm.__leadorbitCrm;
}

export type DomainCrmStore = CrmStore | SupabaseCrmStore;

/** Alias kept for Wave 2 call sites (Launch Pack / assistant / simple views). */
export function getDomainCrm(): DomainCrmStore {
  if (getAuthMode() === "supabase") return getSupabaseCrmStore();
  return getCrmStore();
}
