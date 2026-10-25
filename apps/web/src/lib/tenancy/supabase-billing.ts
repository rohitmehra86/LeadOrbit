export function getSupabaseBillingStore(): SupabaseBillingStore {
  if (!singleton) singleton = new SupabaseBillingStore();
  return singleton;
}
