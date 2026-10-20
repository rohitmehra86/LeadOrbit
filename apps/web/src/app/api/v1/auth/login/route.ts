import { getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { setLocalSessionCookie, getSessionUser } from "@/lib/auth/session";
import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return jsonProblem(503, "Misconfigured", "Supabase credentials are missing");
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return jsonProblem(401, "Unauthorized", error.message || "Invalid credentials");
    }
    await supabase.rpc("maybe_bootstrap_platform_admin");
    const user = await getSessionUser();
    if (!user) {
      return jsonProblem(500, "Internal Server Error", "Session not established after login");
    }
    return jsonOk({ user });
  } catch (err) {
    return fromAuthError(err);
  }
}
