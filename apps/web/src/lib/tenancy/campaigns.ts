import {
  CampaignStore,
  getAuthMode,
  getLocalTenancyStore,
} from "@leadorbit/db";
import { getCrmStore } from "./crm";
import {
  getSupabaseCampaignStore,
  type SupabaseCampaignStore,
} from "./supabase-campaigns";

const globalMkt = globalThis as typeof globalThis & {
  __leadorbitCampaigns?: CampaignStore;
};

/** Mode-aware campaigns: local SQLite or durable Supabase. */
export function getCampaignStore(): CampaignStore {
  if (getAuthMode() === "supabase") {
    return getSupabaseCampaignStore() as unknown as CampaignStore;
  }
  if (!globalMkt.__leadorbitCampaigns) {
    const store = new CampaignStore(getLocalTenancyStore());
    store.setCrmStore(getCrmStore());
    globalMkt.__leadorbitCampaigns = store;
  } else {
    globalMkt.__leadorbitCampaigns.setCrmStore(getCrmStore());
  }
  return globalMkt.__leadorbitCampaigns;
}

export type DomainCampaignStore = CampaignStore | SupabaseCampaignStore;

export function getDomainCampaigns(): DomainCampaignStore {
  if (getAuthMode() === "supabase") return getSupabaseCampaignStore();
  return getCampaignStore();
}

export function isSupabaseCampaignStore(
  store: DomainCampaignStore,
): store is SupabaseCampaignStore {
  return getAuthMode() === "supabase";
}
