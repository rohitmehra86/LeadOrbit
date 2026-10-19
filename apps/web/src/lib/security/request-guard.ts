import { NextResponse } from "next/server";
import { SECURITY_HEADERS } from "@leadorbit/domain";
import { checkRateLimit } from "./rate-limit";
import { assertCsrf } from "./csrf";
import { jsonProblem } from "../api/http";

export function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  // CSP: report-only scaffold — strict enforcement needs per-route nonces.
  if (!res.headers.has("Content-Security-Policy-Report-Only")) {
    res.headers.set(
      "Content-Security-Policy-Report-Only",
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:;",
    );
  }
  return res;
}

export function guardApiRequest(request: Request): NextResponse | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const key = `${ip}:${url.pathname.split("/").slice(0, 5).join("/")}`;
  const rl = checkRateLimit(key);
  if (!rl.allowed) {
    const res = jsonProblem(
      429,
      "Too Many Requests",
      `Rate limit ${rl.limit}/window exceeded`,
    );
    res.headers.set(
      "Retry-After",
      String(Math.ceil(rl.retryAfterMs / 1000) || 1),
    );
    return applySecurityHeaders(res);
  }

  const csrf = assertCsrf(request);
  if (!csrf.ok) {
    return applySecurityHeaders(
      jsonProblem(403, "CSRF check failed", csrf.detail),
    );
  }

  return null;
}
