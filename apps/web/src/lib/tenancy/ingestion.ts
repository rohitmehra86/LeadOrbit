import { IngestionStore, getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { getCrmStore } from "./crm";
import { getSupabaseIngestionStore } from "./supabase-ingestion";

const globalIng = globalThis as typeof globalThis & {
  __leadorbitIngestion?: IngestionStore;
};

export function getIngestionStore(): IngestionStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseIngestionStore() as unknown as IngestionStore;
  }
  if (!globalIng.__leadorbitIngestion) {
    const store = new IngestionStore(getLocalTenancyStore());
    store.setCrmStore(getCrmStore());
    globalIng.__leadorbitIngestion = store;
  } else {
    globalIng.__leadorbitIngestion.setCrmStore(getCrmStore());
  }
  return globalIng.__leadorbitIngestion;
}
