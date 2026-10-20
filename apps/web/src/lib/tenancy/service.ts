import {
  AuthError,
  getAuthMode,
  getLocalTenancyStore,
  type LocalTenancyStore,
  type SessionUser,
} from "@leadorbit/db";
import {
  getSupabaseTenancyStore,
  type SupabaseTenancyStore,
} from "@/lib/tenancy/supabase-store";

export type TenancyStore = LocalTenancyStore | SupabaseTenancyStore;

/**
 * Tenancy operations.
 * - local: in-process LocalTenancyStore
 * - supabase: Postgres + RLS via SupabaseTenancyStore (Vercel staging/prod)
 */
export function getTenancyStore(): TenancyStore {
  if (getAuthMode() === "local") {
    return getLocalTenancyStore();
  }
  return getSupabaseTenancyStore();
}

export async function withTenancy<T>(
  actor: SessionUser,
  fn: (store: TenancyStore, actor: SessionUser) => Promise<T>,
): Promise<T> {
  const store = getTenancyStore();
  return fn(store, actor);
}

export function assertLocalTenancy(): LocalTenancyStore {
  if (getAuthMode() !== "local") {
    throw new AuthError(
      "This operation is only available in AUTH_MODE=local",
      "validation",
    );
  }
  return getLocalTenancyStore();
}
