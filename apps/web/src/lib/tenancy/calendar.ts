import {
  CalendarStore,
  getLocalTenancyStore,
  SqliteJobQueue,
  getCrmDatabase,
} from "@leadorbit/db";

const globalCal = globalThis as typeof globalThis & {
  __leadorbitCalendar?: CalendarStore;
};

export function getCalendarStore(): CalendarStore {
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
