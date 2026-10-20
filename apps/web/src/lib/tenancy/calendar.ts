import {
  CalendarStore,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
  getAuthMode,
} from "@leadorbit/db";
import { getSupabaseCalendarStore } from "./supabase-calendar";

const globalCal = globalThis as typeof globalThis & {
  __leadorbitCalendar?: CalendarStore;
};

/** Local SQLite CalendarStore, or Supabase adapter cast for shared call sites. */
export function getCalendarStore(): CalendarStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseCalendarStore() as unknown as CalendarStore;
  }
  if (!globalCal.__leadorbitCalendar) {
    const db = getCrmDatabase();
    globalCal.__leadorbitCalendar = new CalendarStore(
      getLocalTenancyStore(),
      db,
      new SqliteJobQueue(db),
    );
  }
  return globalCal.__leadorbitCalendar;
}
