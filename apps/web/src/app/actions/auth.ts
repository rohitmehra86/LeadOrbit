"use server";

import { redirect } from "next/navigation";
import { getAuthMode } from "@leadorbit/db";
import { clearLocalSessionCookie } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOutAction() {
  if (getAuthMode() === "local") {
    await clearLocalSessionCookie();
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.signOut();
  }
  redirect("/login");
}
