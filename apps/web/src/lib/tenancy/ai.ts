import {
  AiStore,
  getAuthMode,
  getLocalTenancyStore,
  getJobQueue,
  getCrmDatabase,
  type BillingStore,
} from "@leadorbit/db";
import { getKnowledgeStore } from "./knowledge";
import { getBillingStore } from "./billing";

const globalAi = globalThis as typeof globalThis & {
  __leadorbitAi?: AiStore;
};

/**
 * AI store remains SQLite-backed. Metering in supabase mode goes through
 * getBillingStore() in the assistant execute path, not this injection.
 */
export function getAiStore(): AiStore {
  if (!globalAi.__leadorbitAi) {
    const db = getCrmDatabase();
    globalAi.__leadorbitAi = new AiStore(
      getLocalTenancyStore(),
      db,
      getKnowledgeStore(),
      getJobQueue(),
    );
  }
  if (getAuthMode() !== "supabase") {
    globalAi.__leadorbitAi.setBillingStore(getBillingStore() as BillingStore);
  } else {
    globalAi.__leadorbitAi.setBillingStore(null);
  }
  return globalAi.__leadorbitAi;
}
