import { NextRequest } from "next/server";
import { getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { setLocalSessionCookie } from "@/lib/auth/session";
import { sessionUserFromSupabase } from "@/lib/auth/supabase-session-user";
import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return jsonProblem(400, "Validation Error", "Email and password required");
    }

    if (getAuthMode() === "local") {
      const store = getLocalTenancyStore();
      const user = await store.signIn(email, password);
      await setLocalSessionCookie(user);
      return jsonOk({ user });
    }

    const route = createSupabaseRouteClient(request);
    if (!route) {
      return jsonProblem(503, "Misconfigured", "Supabase credentials are missing");
    }
    const { supabase, withCookies } = route;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return jsonProblem(401, "Unauthorized", error?.message || "Invalid credentials");
    }

    const sessionUser = await sessionUserFromSupabase(supabase, data.user);
    if (!sessionUser) {
      return jsonProblem(500, "Internal Server Error", "Session not established after login");
    }
    return withCookies(jsonOk({ user: sessionUser }));
  } catch (err) {
    return fromAuthError(err);
  }
}
