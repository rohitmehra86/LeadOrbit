import {
  InboxStore,
  getAuthMode,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";
import { getSupabaseInboxStore } from "./supabase-inbox";

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
  return globalInbox.__leadorbitInbox;
}
