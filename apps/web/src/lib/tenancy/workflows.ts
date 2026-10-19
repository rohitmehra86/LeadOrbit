import {
  WorkflowStore,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";
import { getCrmStore } from "./crm";

const globalWf = globalThis as typeof globalThis & {
  __leadorbitWorkflows?: WorkflowStore;
};

export function getWorkflowStore(): WorkflowStore {
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
