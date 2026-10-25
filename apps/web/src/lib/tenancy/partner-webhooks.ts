import {
  PartnerWebhookStore,
  getLocalTenancyStore,
  getJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";

const globalPw = globalThis as typeof globalThis & {
  __leadorbitPartnerWebhooks?: PartnerWebhookStore;
};

export function getPartnerWebhookStore(): PartnerWebhookStore {
  if (!globalPw.__leadorbitPartnerWebhooks) {
    const db = getCrmDatabase();
    globalPw.__leadorbitPartnerWebhooks = new PartnerWebhookStore(
      getLocalTenancyStore(),
      db,
      getJobQueue(),
    );
  }
  return globalPw.__leadorbitPartnerWebhooks;
}
