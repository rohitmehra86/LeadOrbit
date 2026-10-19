import {
  WhiteLabelStore,
  getLocalTenancyStore,
  getCrmDatabase,
} from "@leadorbit/db";
import { getBillingStore } from "./billing";

const globalWl = globalThis as typeof globalThis & {
  __leadorbitWhiteLabel?: WhiteLabelStore;
};

export function getWhiteLabelStore(): WhiteLabelStore {
  if (!globalWl.__leadorbitWhiteLabel) {
    globalWl.__leadorbitWhiteLabel = new WhiteLabelStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
      getBillingStore(),
    );
  } else {
    globalWl.__leadorbitWhiteLabel.setBillingStore(getBillingStore());
  }
  return globalWl.__leadorbitWhiteLabel;
}
