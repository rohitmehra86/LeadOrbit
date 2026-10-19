import { CampaignStore, CrmStore, getLocalTenancyStore } from "@leadorbit/db";
import { getCrmStore } from "./crm";

const globalMkt = globalThis as typeof globalThis & {
  __leadorbitCampaigns?: CampaignStore;
};

export function getCampaignStore(): CampaignStore {
  if (!globalMkt.__leadorbitCampaigns) {
    const store = new CampaignStore(getLocalTenancyStore());
    store.setCrmStore(getCrmStore());
    globalMkt.__leadorbitCampaigns = store;
  } else {
    // Ensure CRM link after hot reload
    globalMkt.__leadorbitCampaigns.setCrmStore(getCrmStore());
  }
  return globalMkt.__leadorbitCampaigns;
}

// Keep CrmStore import referenced for type clarity in bundlers
void (CrmStore as unknown);
