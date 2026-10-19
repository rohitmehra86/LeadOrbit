import {
  RealEstateStore,
  getLocalTenancyStore,
  getCrmDatabase,
} from "@leadorbit/db";
import { getCalendarStore } from "./calendar";
import { getAiStore } from "./ai";

const globalRe = globalThis as typeof globalThis & {
  __leadorbitRealEstate?: RealEstateStore;
};

export function getRealEstateStore(): RealEstateStore {
  if (!globalRe.__leadorbitRealEstate) {
    const store = new RealEstateStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
      getCalendarStore(),
    );
    globalRe.__leadorbitRealEstate = store;
  } else {
    globalRe.__leadorbitRealEstate.setCalendarStore(getCalendarStore());
  }
  // Keep AI inventory-aware when module enabled (optional hook — not core CRM).
  getAiStore().setRealEstateStore(globalRe.__leadorbitRealEstate);
  return globalRe.__leadorbitRealEstate;
}
