import { CrmStore, getLocalTenancyStore } from "@leadorbit/db";

const globalCrm = globalThis as typeof globalThis & { __leadorbitCrm?: CrmStore };

export function getCrmStore(): CrmStore {
  if (!globalCrm.__leadorbitCrm) {
    globalCrm.__leadorbitCrm = new CrmStore(getLocalTenancyStore());
  }
  return globalCrm.__leadorbitCrm;
}
