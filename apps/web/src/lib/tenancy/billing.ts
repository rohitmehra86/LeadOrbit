import {
  BillingStore,
  getAuthMode,
  getLocalTenancyStore,
  getCrmDatabase,
} from "@leadorbit/db";
import {
  getSupabaseBillingStore,
  type SupabaseBillingStore,
} from "@/lib/tenancy/supabase-billing";

const globalBilling = globalThis as typeof globalThis & {
  __leadorbitBilling?: BillingStore;
};

export type DomainBillingStore = BillingStore | SupabaseBillingStore;

/**
 * Mode-aware billing store.
 * - local: SQLite BillingStore
 * - supabase: Postgres via SupabaseBillingStore — never falls back to SQLite
 */
export function getBillingStore(): DomainBillingStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseBillingStore();
  }
  if (!globalBilling.__leadorbitBilling) {
    globalBilling.__leadorbitBilling = new BillingStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
    );
  }
  return globalBilling.__leadorbitBilling;
}

export function isSupabaseBillingStore(
  _store: DomainBillingStore,
): _store is SupabaseBillingStore {
  return getAuthMode() === "supabase";
}
