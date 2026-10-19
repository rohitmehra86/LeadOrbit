import {
  BillingStore,
  getLocalTenancyStore,
  getCrmDatabase,
} from "@leadorbit/db";

const globalBilling = globalThis as typeof globalThis & {
  __leadorbitBilling?: BillingStore;
};

export function getBillingStore(): BillingStore {
  if (!globalBilling.__leadorbitBilling) {
    globalBilling.__leadorbitBilling = new BillingStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
    );
  }
  return globalBilling.__leadorbitBilling;
}
