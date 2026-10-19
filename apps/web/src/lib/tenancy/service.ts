import {
  AuthError,
  getAuthMode,
  getLocalTenancyStore,
  type LocalTenancyStore,
  type SessionUser,
} from "@leadorbit/db";

/**
 * Tenancy operations. Local mode uses in-process store with permission checks.
 * Supabase mode requires applied migrations + repository adapters (blocked until
 * credentials + project link). Do not pretend Supabase path works without config.
 */
export function getTenancyStore(): LocalTenancyStore {
  if (getAuthMode() !== "local") {
    throw new AuthError(
      "Supabase tenancy repositories are not wired yet. Apply migrations and set credentials, or use AUTH_MODE=local for development.",
      "validation",
    );
  }
  return getLocalTenancyStore();
}

export async function withTenancy<T>(
  actor: SessionUser,
  fn: (store: LocalTenancyStore, actor: SessionUser) => Promise<T>,
): Promise<T> {
  const store = getTenancyStore();
  return fn(store, actor);
}
