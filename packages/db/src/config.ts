export type AuthMode = "local" | "supabase";

export function isSupabaseConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0,
  );
}

/**
 * Default to local when Supabase env is missing so Milestone 2 UX can be exercised.
 * Production must set AUTH_MODE=supabase with real credentials.
 */
export function getAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  if (env.AUTH_MODE === "supabase") return "supabase";
  if (env.AUTH_MODE === "local") return "local";
  return isSupabaseConfigured(env) ? "supabase" : "local";
}
