import type { SessionDto } from "@leadorbit/api-contracts";
import { authStatus, getSessionUser } from "@/lib/auth/session";
import { jsonOk, jsonProblem } from "@/lib/api/http";

export async function GET() {
  const user = await getSessionUser();
  const status = authStatus();
  if (!user) {
    return jsonProblem(401, "Unauthorized", "No active session");
  }
  const body: SessionDto = {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isPlatformAdmin: user.isPlatformAdmin,
    },
    authMode: status.authMode,
    supabaseConfigured: status.supabaseConfigured,
  };
  return jsonOk(body);
}
