import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import {
  getAuthMode,
  getLocalTenancyStore,
  isSupabaseConfigured,
  type SessionUser,
} from "@leadorbit/db";

const COOKIE = "lo_session";
const DEV_DEFAULT_SECRET = "leadorbit-local-dev-only-change-me";

function sessionSecret(): Uint8Array {
  const raw =
    process.env.SESSION_SECRET ||
    process.env.DEV_SESSION_SECRET ||
    DEV_DEFAULT_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SESSION_SECRET || raw === DEV_DEFAULT_SECRET)
  ) {
    throw new Error(
      "SESSION_SECRET must be set to a strong value in production",
    );
  }
  return new TextEncoder().encode(raw);
}

export function sessionUsesDevDefaultSecret(): boolean {
  const raw = process.env.SESSION_SECRET || process.env.DEV_SESSION_SECRET;
  return !raw || raw === DEV_DEFAULT_SECRET;
}

export async function createLocalSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecret());
}

export async function setLocalSessionCookie(user: SessionUser): Promise<void> {
  const token = await createLocalSessionToken(user);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    // Prevent client JS from reading; host-only cookie (no domain=).
  });
}

export async function clearLocalSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readLocalSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const sub = payload.sub;
    if (!sub || typeof payload.email !== "string") return null;
    // Refresh platform-admin flag from store (JWT may be stale)
    const store = getLocalTenancyStore();
    const fresh = await store.getUser(sub);
    if (!fresh) return null;
    return fresh;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const mode = getAuthMode();
  if (mode === "local") {
    return readLocalSession();
  }
  // Supabase path — lazy import to avoid bundling issues when unused
  const { createSupabaseServerClient } = await import("../supabase/server");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  let isPlatformAdmin = Boolean(data.user.app_metadata?.platform_admin);
  if (!isPlatformAdmin) {
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    isPlatformAdmin = Boolean(adminRow);
  }

  return {
    id: data.user.id,
    email: data.user.email,
    fullName:
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      null,
    isPlatformAdmin,
  };
}

export function authStatus() {
  return {
    authMode: getAuthMode(),
    supabaseConfigured: isSupabaseConfigured(),
    sessionSecretConfigured: !sessionUsesDevDefaultSecret(),
  };
}
