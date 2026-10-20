import { getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { isValidEmail, sanitizePlainText } from "@leadorbit/domain";
import { setLocalSessionCookie, getSessionUser } from "@/lib/auth/session";
import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
    };
    if (!isValidEmail(body.email)) {
      return jsonProblem(400, "Validation Error", "Valid email required");
    }
    if (!body.password || body.password.length < 8) {
      return jsonProblem(400, "Validation Error", "Password must be 8+ characters");
    }
    const email = body.email!.trim().toLowerCase();
    const password = body.password!;
    const fullName = sanitizePlainText(body.fullName, 120) || undefined;

    if (getAuthMode() === "local") {
      const store = getLocalTenancyStore();
      const user = await store.signUp({ email, password, fullName });
      store.maybeBootstrapFirstPlatformAdmin(user.id);
      const sessionUser = (await store.getUser(user.id))!;
      await setLocalSessionCookie(sessionUser);
      return jsonOk({ user: sessionUser }, { status: 201 });
    }

    // AUTH_MODE=supabase — create Auth user and establish SSR cookie session
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return jsonProblem(503, "Misconfigured", "Supabase credentials are missing");
    }

    const admin = createSupabaseAdminClient();
    if (admin) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (createErr) {
        const msg = createErr.message || "Sign-up failed";
        const conflict = /already|registered|exists/i.test(msg);
        return jsonProblem(conflict ? 409 : 400, conflict ? "Conflict" : "Validation Error", msg);
      }
      if (!created.user) {
        return jsonProblem(500, "Internal Server Error", "User was not created");
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        return jsonProblem(401, "Unauthorized", signInErr.message);
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: fullName ? { full_name: fullName } : undefined },
      });
      if (error) {
        const msg = error.message || "Sign-up failed";
        const conflict = /already|registered|exists/i.test(msg);
        return jsonProblem(conflict ? 409 : 400, conflict ? "Conflict" : "Validation Error", msg);
      }
      if (!data.session) {
        return jsonProblem(
          400,
          "Confirm Email",
          "Account created. Confirm your email, then sign in. Set SUPABASE_SERVICE_ROLE_KEY on Vercel to auto-confirm staging users.",
        );
      }
    }

    // Bootstrap first platform admin + ensure profile via RPC/trigger
    await supabase.rpc("maybe_bootstrap_platform_admin");
    const user = await getSessionUser();
    if (!user) {
      return jsonProblem(500, "Internal Server Error", "Session not established after sign-up");
    }
    return jsonOk({ user }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
