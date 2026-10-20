import { type NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "./lib/supabase/middleware";
import { getAuthMode } from "@leadorbit/db/config";
// Import security-only entry (no node:crypto) — safe for Edge middleware.
import {
  SECURITY_HEADERS,
  evaluateRateLimit,
  csrfOriginAllowed,
} from "@leadorbit/domain/security";

/**
 * Edge middleware: security headers, coarse rate limit, CSRF origin review for
 * mutating /api requests, plus Supabase session refresh when configured.
 *
 * Note: edge runtime keeps its own rate-limit map (per isolate). The Node
 * request-guard in lib/security provides the same policy for route handlers
 * that opt in; middleware covers the edge path.
 */

const edgeBuckets = new Map<string, number[]>();

function edgeRateLimit(key: string): {
  allowed: boolean;
  retryAfterMs: number;
  limit: number;
} {
  const limit = Number(process.env.RATE_LIMIT_PER_WINDOW ?? 120);
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const now = Date.now();
  const hits = (edgeBuckets.get(key) ?? []).filter((t) => t > now - windowMs);
  const result = evaluateRateLimit({ hits, nowMs: now, windowMs, limit });
  if (result.allowed) hits.push(now);
  edgeBuckets.set(key, hits);
  return result;
}

function allowedOrigins(request: NextRequest): string[] {
  const fromEnv = (process.env.CSRF_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.nextUrl.origin;
  const extras = [origin, "http://127.0.0.1:43127", "http://localhost:43127"];
  if (process.env.NEXT_PUBLIC_APP_URL) {
    extras.push(process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));
  }
  return [...new Set([...extras, ...fromEnv])];
}

function withSecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  res.headers.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:;",
  );
  return res;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    const rl = edgeRateLimit(`${ip}:${path.split("/").slice(0, 5).join("/")}`);
    if (!rl.allowed) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            type: "https://leadorbit.dev/problems/429",
            title: "Too Many Requests",
            status: 429,
            detail: `Rate limit ${rl.limit}/window exceeded`,
          },
          {
            status: 429,
            headers: {
              "content-type": "application/problem+json",
              "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 1),
            },
          },
        ),
      );
    }

    const method = request.method.toUpperCase();
    const isSafe = ["GET", "HEAD", "OPTIONS"].includes(method);
    const isWebhook =
      path.includes("/webhooks/") ||
      path.includes("/billing/webhooks/") ||
      path.includes("/public/partners/") ||
      path.includes("/public/messaging/") ||
      path.includes("/public/forms/") ||
      path.includes("/public/leads");

    if (!isSafe && !isWebhook) {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      const allowMissing =
        process.env.CSRF_ALLOW_MISSING === "1" ||
        process.env.NODE_ENV === "test" ||
        (process.env.AUTH_MODE !== "supabase" &&
          process.env.CSRF_STRICT !== "1" &&
          !origin &&
          !referer);
      const csrf = csrfOriginAllowed({
        origin,
        referer,
        allowedOrigins: allowedOrigins(request),
        allowMissing,
      });
      if (!csrf.ok) {
        return withSecurityHeaders(
          NextResponse.json(
            {
              type: "https://leadorbit.dev/problems/403",
              title: "CSRF check failed",
              status: 403,
              detail: csrf.detail,
            },
            {
              status: 403,
              headers: { "content-type": "application/problem+json" },
            },
          ),
        );
      }
    }
  }

  let res: NextResponse;
  if (getAuthMode() === "supabase") {
    res = await updateSupabaseSession(request);
  } else {
    res = NextResponse.next();
  }
  return withSecurityHeaders(res);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
