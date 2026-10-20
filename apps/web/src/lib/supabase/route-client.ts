import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@leadorbit/db";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Route-handler Supabase client that buffers Set-Cookie onto the JSON response.
 * Prefer this over cookies() from next/headers for signup/login so the browser
 * always receives the session cookies in the same response.
 */
export function createSupabaseRouteClient(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const pending: PendingCookie[] = [];

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  function withCookies(response: NextResponse): NextResponse {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  return { supabase, withCookies };
}
