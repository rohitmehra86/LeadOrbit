import { getAuthMode, getLocalTenancyStore } from "@leadorbit/db";
import { setLocalSessionCookie } from "@/lib/auth/session";
import { fromAuthError, jsonOk, jsonProblem } from "@/lib/api/http";

export async function POST(request: Request) {
  try {
    if (getAuthMode() !== "local") {
      return jsonProblem(
        501,
        "Not Implemented",
        "Use Supabase Auth client sign-in when AUTH_MODE=supabase.",
      );
    }
    const body = (await request.json()) as { email?: string; password?: string };
    const store = getLocalTenancyStore();
    const user = await store.signIn(body.email ?? "", body.password ?? "");
    await setLocalSessionCookie(user);
    return jsonOk({ user });
  } catch (err) {
    return fromAuthError(err);
  }
}
