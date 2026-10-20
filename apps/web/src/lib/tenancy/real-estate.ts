import {
  RealEstateStore,
  getLocalTenancyStore,
  getCrmDatabase,
  getAuthMode,
} from "@leadorbit/db";
import { getCalendarStore } from "./calendar";
import { getAiStore } from "./ai";
import { getSupabaseRealEstateStore } from "./supabase-real-estate";

const globalRe = globalThis as typeof globalThis & {
  __leadorbitRealEstate?: RealEstateStore;
};

/** Local SQLite RealEstateStore, or Supabase adapter cast for shared call sites. */
export function getRealEstateStore(): RealEstateStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseRealEstateStore() as unknown as RealEstateStore;
  }
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
  getAiStore().setRealEstateStore(globalRe.__leadorbitRealEstate);
  return globalRe.__leadorbitRealEstate;
}
