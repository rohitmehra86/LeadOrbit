import {
  WhiteLabelStore,
  getAuthMode,
  getLocalTenancyStore,
  getCrmDatabase,
  type BillingStore,
} from "@leadorbit/db";
import { getBillingStore } from "./billing";

const globalWl = globalThis as typeof globalThis & {
  __leadorbitWhiteLabel?: WhiteLabelStore;
};

/**
 * White-label store is still SQLite-backed. In supabase mode do not inject the
 * Postgres billing store (sync entitlement APIs differ) — pages call
 * getBillingStore().assertEntitled separately.
 */
export function getWhiteLabelStore(): WhiteLabelStore {
  const billingForSqlite =
    getAuthMode() === "supabase"
      ? null
      : (getBillingStore() as BillingStore);
  if (!globalWl.__leadorbitWhiteLabel) {
    globalWl.__leadorbitWhiteLabel = new WhiteLabelStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
      billingForSqlite,
    );
  } else if (billingForSqlite) {
    globalWl.__leadorbitWhiteLabel.setBillingStore(billingForSqlite);
  }
  return globalWl.__leadorbitWhiteLabel;
}
