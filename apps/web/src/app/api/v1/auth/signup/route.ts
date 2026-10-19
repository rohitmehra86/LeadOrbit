import { getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { setLocalSessionCookie } from "@/lib/auth/session";
import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";

export async function POST(request: Request) {
  try {
    if (getAuthMode() !== "local") {
      return jsonProblem(
        501,
        "Not Implemented",
        "Use Supabase Auth client sign-up when AUTH_MODE=supabase, or set AUTH_MODE=local for the local store.",
      );
    }
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
    };
    const store = getLocalTenancyStore();
    const user = await store.signUp({
      email: body.email ?? "",
      password: body.password ?? "",
      fullName: body.fullName,
    });
    // Dev-only: first local user becomes platform admin for SaaS portal skeleton
    store.maybeBootstrapFirstPlatformAdmin(user.id);
    const sessionUser = (await store.getUser(user.id))!;
    await setLocalSessionCookie(sessionUser);
    return jsonOk({ user: sessionUser }, { status: 201 });
  } catch (err) {
    return fromAuthError(err);
  }
}
