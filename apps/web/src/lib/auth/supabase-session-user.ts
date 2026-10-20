import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@leadorbit/db";

export async function sessionUserFromSupabase(
  supabase: SupabaseClient,
  user: User,
): Promise<SessionUser | null> {
  if (!user.email) return null;

  // Best-effort: first user becomes platform admin when table is empty.
  await supabase.rpc("maybe_bootstrap_platform_admin");

  let isPlatformAdmin = Boolean(
    (user.app_metadata as { platform_admin?: boolean } | undefined)?.platform_admin,
  );
  if (!isPlatformAdmin) {
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    isPlatformAdmin = Boolean(adminRow);
  }

  return {
    id: user.id,
    email: user.email,
    fullName:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
    isPlatformAdmin,
  };
}
