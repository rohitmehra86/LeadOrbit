/**
 * Milestone 11 — shared security helpers (rate limit math, CSRF origin checks,
 * structured AI output validation, input sanitization).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

/** Sliding-window counter — pure helper; storage is the caller's job. */
export function evaluateRateLimit(input: {
  hits: number[];
  nowMs: number;
  windowMs: number;
  limit: number;
}): RateLimitResult {
  const cutoff = input.nowMs - input.windowMs;
  const recent = input.hits.filter((t) => t > cutoff);
  if (recent.length >= input.limit) {
    const oldest = recent[0] ?? input.nowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + input.windowMs - input.nowMs),
      limit: input.limit,
    };
  }
  return {
    allowed: true,
    remaining: input.limit - recent.length - 1,
    retryAfterMs: 0,
    limit: input.limit,
  };
}

/**
 * CSRF / cross-site request review for cookie-session APIs.
 * Allows missing Origin+Referer in same-origin navigations that omit both
 * only when `allowMissing` is true (non-browser clients / tests).
 */
export function csrfOriginAllowed(input: {
  origin: string | null;
  referer: string | null;
  allowedOrigins: string[];
  allowMissing?: boolean;
}): { ok: boolean; detail: string } {
  const allowed = new Set(
    input.allowedOrigins.map((o) => o.replace(/\/$/, "").toLowerCase()),
  );
  if (input.origin) {
    const o = input.origin.toLowerCase();
    if (allowed.has(o)) return { ok: true, detail: "origin ok" };
    return { ok: false, detail: `Origin not allowed: ${input.origin}` };
  }
  if (input.referer) {
    try {
      const u = new URL(input.referer);
      const o = u.origin.toLowerCase();
      if (allowed.has(o)) return { ok: true, detail: "referer ok" };
      return { ok: false, detail: `Referer origin not allowed: ${o}` };
    } catch {
      return { ok: false, detail: "Malformed Referer" };
    }
  }
  if (input.allowMissing) {
    return { ok: true, detail: "missing origin/referer allowed" };
  }
  return { ok: false, detail: "Missing Origin and Referer" };
}

export function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  return true;
}

/** Strip control chars and cap length for free-text API fields. */
export function sanitizePlainText(input: unknown, maxLen = 2000): string {
  if (typeof input !== "string") return "";
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLen);
}

export function isValidEmail(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const s = input.trim();
  if (s.length < 3 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Validate AI structured output against a minimal JSON-schema-like shape.
 * Supports type: object|string|number|boolean|array and required[].
 */
export function validateStructuredOutput(
  value: unknown,
  schema: {
    type?: string;
    required?: string[];
    properties?: Record<
      string,
      { type?: string; enum?: unknown[] }
    >;
  },
): { ok: boolean; errors: string[]; value: Record<string, unknown> | null } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["Expected object"], value: null };
  }
  const obj = value as Record<string, unknown>;
  const errors: string[] = [];
  if (schema.type && schema.type !== "object") {
    errors.push(`Unsupported root type ${schema.type}`);
  }
  for (const key of schema.required ?? []) {
    if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
      errors.push(`Missing required: ${key}`);
    }
  }
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (!(key in obj) || obj[key] === undefined) continue;
    const v = obj[key];
    if (prop.type === "string" && typeof v !== "string") {
      errors.push(`${key}: expected string`);
    }
    if (prop.type === "number" && typeof v !== "number") {
      errors.push(`${key}: expected number`);
    }
    if (prop.type === "boolean" && typeof v !== "boolean") {
      errors.push(`${key}: expected boolean`);
    }
    if (prop.type === "array" && !Array.isArray(v)) {
      errors.push(`${key}: expected array`);
    }
    if (prop.enum && !prop.enum.includes(v)) {
      errors.push(`${key}: value not in enum`);
    }
  }
  return { ok: errors.length === 0, errors, value: obj };
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
};
