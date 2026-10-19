import { type NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "./lib/supabase/middleware";
import { getAuthMode } from "@leadorbit/db/config";


export async function middleware(request: NextRequest) {
  if (getAuthMode() === "supabase") {
    return updateSupabaseSession(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
