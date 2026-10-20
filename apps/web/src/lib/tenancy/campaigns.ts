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

/** Local SQLite campaigns (Advanced marketing builders). */
export function getCampaignStore(): CampaignStore {
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

/** Mode-aware campaigns for Launch Pack, public forms/pages, Assistant, Results. */
export function getDomainCampaigns(): DomainCampaignStore {
  if (getAuthMode() === "supabase") return getSupabaseCampaignStore();
  return getCampaignStore();
}

export function isSupabaseCampaignStore(
  store: DomainCampaignStore,
): store is SupabaseCampaignStore {
  return getAuthMode() === "supabase";
}
