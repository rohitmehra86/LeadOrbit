import {
  WorkflowStore,
  getAuthMode,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";
import { getCrmStore } from "./crm";
import { getSupabaseWorkflowStore } from "./supabase-workflows";

const globalWf = globalThis as typeof globalThis & {
  __leadorbitWorkflows?: WorkflowStore;
};

export function getWorkflowStore(): WorkflowStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseWorkflowStore() as unknown as WorkflowStore;
  }
  if (!globalWf.__leadorbitWorkflows) {
    const db = getCrmDatabase();
    const store = new WorkflowStore(
      getLocalTenancyStore(),
      db,
      new SqliteJobQueue(db),
      getCrmStore(),
    );
    globalWf.__leadorbitWorkflows = store;
  } else {
    globalWf.__leadorbitWorkflows.setCrmStore(getCrmStore());
  }
  return globalWf.__leadorbitWorkflows;
}
