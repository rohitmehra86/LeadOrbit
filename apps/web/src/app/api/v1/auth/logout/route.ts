import { getAuthMode } from "@leadorbit/db";
import { clearLocalSessionCookie } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonOk } from "@/lib/api/http";

export async function POST() {
  if (getAuthMode() === "local") {
    await clearLocalSessionCookie();
    return jsonOk({ ok: true });
  }
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return jsonOk({ ok: true });
}
