import { csrfOriginAllowed } from "@leadorbit/domain";

function defaultAllowedOrigins(): string[] {
  const fromEnv = (process.env.CSRF_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const port = process.env.PORT ?? "43127";
  const defaults = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  if (process.env.NEXT_PUBLIC_APP_URL) {
    defaults.push(process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));
  }
  return [...new Set([...defaults, ...fromEnv])];
}

/**
 * Cookie-session CSRF review: require Origin/Referer match for browser mutating
 * requests. Webhooks and signed public ingest paths should skip this and use
 * signature verification instead.
 */
export function assertCsrf(request: Request): { ok: boolean; detail: string } {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { ok: true, detail: "safe method" };
  }

  // Signed / provider webhooks — CSRF not applicable
  const path = new URL(request.url).pathname;
  if (
    path.includes("/webhooks/") ||
    path.includes("/billing/webhooks/") ||
    path.includes("/public/messaging/") ||
    path.includes("/public/forms/") ||
    path.includes("/public/leads")
  ) {
    return { ok: true, detail: "webhook/public ingest path" };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowMissing =
    process.env.CSRF_ALLOW_MISSING === "1" ||
    process.env.NODE_ENV === "test" ||
    // Local API clients (curl) during AUTH_MODE=local
    (process.env.AUTH_MODE === "local" &&
      process.env.CSRF_STRICT !== "1" &&
      !origin &&
      !referer);

  return csrfOriginAllowed({
    origin,
    referer,
    allowedOrigins: defaultAllowedOrigins(),
    allowMissing,
  });
}
