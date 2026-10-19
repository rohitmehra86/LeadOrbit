import {
  InboxStore,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";

const globalInbox = globalThis as typeof globalThis & {
  __leadorbitInbox?: InboxStore;
};

export function getInboxStore(): InboxStore {
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
