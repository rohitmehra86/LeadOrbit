import {
  AnalyticsStore,
  getLocalTenancyStore,
  getCrmDatabase,
  getJobQueue,
} from "@leadorbit/db";

const globalAnalytics = globalThis as typeof globalThis & {
  __leadorbitAnalytics?: AnalyticsStore;
};

export function getAnalyticsStore(): AnalyticsStore {
  if (!globalAnalytics.__leadorbitAnalytics) {
    const store = new AnalyticsStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
      getJobQueue(),
    );
    globalAnalytics.__leadorbitAnalytics = store;
  } else {
    globalAnalytics.__leadorbitAnalytics.setQueue(getJobQueue());
  }
  return globalAnalytics.__leadorbitAnalytics;
}
