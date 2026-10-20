import {
  MarketplaceStore,
  getLocalTenancyStore,
  getCrmDatabase,
} from "@leadorbit/db";

const globalMp = globalThis as typeof globalThis & {
  __leadorbitMarketplace?: MarketplaceStore;
};

export function getMarketplaceStore(): MarketplaceStore {
  if (!globalMp.__leadorbitMarketplace) {
    globalMp.__leadorbitMarketplace = new MarketplaceStore(
      getLocalTenancyStore(),
      getCrmDatabase(),
    );
  }
  return globalMp.__leadorbitMarketplace;
}
