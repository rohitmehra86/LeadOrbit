import {
  InboxStore,
  getAuthMode,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";
import { getSupabaseInboxStore } from "./supabase-inbox";
import { getBillingStore } from "./billing";

const globalInbox = globalThis as typeof globalThis & {
  __leadorbitInbox?: InboxStore;
};

export function getInboxStore(): InboxStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseInboxStore() as unknown as InboxStore;
  }
  if (!globalInbox.__leadorbitInbox) {
    const db = getCrmDatabase();
    globalInbox.__leadorbitInbox = new InboxStore(
      getLocalTenancyStore(),
      db,
      new SqliteJobQueue(db),
    );
  }
  if (getAuthMode() !== "supabase") {
    globalInbox.__leadorbitInbox.setBillingStore(
      getBillingStore() as import("@leadorbit/db").BillingStore,
    );
  } else {
    globalInbox.__leadorbitInbox.setBillingStore(null);
  }
  return globalInbox.__leadorbitInbox;
}
