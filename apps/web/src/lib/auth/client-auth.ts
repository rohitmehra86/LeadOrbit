"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "local" | "supabase";

export async function fetchAuthMode(): Promise<AuthMode> {
  try {
    const res = await fetch("/api/v1/health", { cache: "no-store" });
    if (!res.ok) return "local";
    const body = (await res.json()) as { authMode?: string };
    return body.authMode === "supabase" ? "supabase" : "local";
  } catch {
    return "local";
  }
}

async function problemDetail(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { detail?: string } | null;
  return body?.detail ?? `Request failed (${res.status})`;
}

/**
 * Signup that works for both AUTH_MODE=local (API + cookie) and AUTH_MODE=supabase
 * (server Auth with service-role when available, browser Auth fallback).
 */
export async function clientSignUp(input: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const mode = await fetchAuthMode();
  const payload = {
    email: input.email,
    password: input.password,
    fullName: input.fullName,
  };

  const res = await fetch("/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };

  // Stale deploy / missing service role: try browser Supabase Auth when configured.
  if (
    mode === "supabase" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    (res.status === 501 || res.status === 503 || res.status === 400)
  ) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: input.fullName ? { full_name: input.fullName } : undefined,
        },
      });
      if (error) return { ok: false, detail: error.message };
      if (!data.session) {
        return {
          ok: false,
          detail:
            "Account created. Confirm your email, then sign in. On Vercel set SUPABASE_SERVICE_ROLE_KEY for the leadorbit project and Redeploy to auto-confirm staging users.",
        };
      }
      await supabase.rpc("maybe_bootstrap_platform_admin");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "Browser sign-up failed",
      };
    }
  }

  return { ok: false, detail: await problemDetail(res) };
}

export async function clientSignIn(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const mode = await fetchAuthMode();
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return { ok: true };

  if (
    mode === "supabase" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    (res.status === 501 || res.status === 503)
  ) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error) return { ok: false, detail: error.message };
      await supabase.rpc("maybe_bootstrap_platform_admin");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "Browser sign-in failed",
      };
    }
  }

  return { ok: false, detail: await problemDetail(res) };
}
