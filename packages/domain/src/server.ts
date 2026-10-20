/**
 * Server-only domain helpers (Node crypto / dns).
 * Do NOT import from client components or edge middleware.
 * Use: import { ... } from "@leadorbit/domain/server"
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveTxt } from "node:dns/promises";

const SIG_PREFIX = "sha256=";

/** HMAC-SHA256 over `${timestamp}.${rawBody}` — Stripe-style signed webhooks. */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `${SIG_PREFIX}${digest}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowMs?: number;
  maxSkewSec?: number;
}): { ok: true } | { ok: false; reason: string } {
  const maxSkew = input.maxSkewSec ?? 300;
  const now = input.nowMs ?? Date.now();
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "Invalid timestamp" };
  }
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  if (Math.abs(now - tsMs) > maxSkew * 1000) {
    return { ok: false, reason: "Timestamp outside allowed skew" };
  }
  const expected = signWebhookPayload(
    input.secret,
    input.timestamp,
    input.rawBody,
  );
  const provided = input.signature.trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Signature mismatch" };
  }
  return { ok: true };
}

export function signMessagingWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyMessagingWebhook(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowMs?: number;
  maxSkewSec?: number;
}): { ok: true } | { ok: false; reason: string } {
  const maxSkew = input.maxSkewSec ?? 300;
  const now = input.nowMs ?? Date.now();
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Invalid timestamp" };
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  if (Math.abs(now - tsMs) > maxSkew * 1000) {
    return { ok: false, reason: "Timestamp outside allowed skew" };
  }
  const expected = signMessagingWebhook(
    input.secret,
    input.timestamp,
    input.rawBody,
  );
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature.trim());
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Signature mismatch" };
  }
  return { ok: true };
}

export function signStripeWebhook(
  rawBody: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signed = `${timestamp}.${rawBody}`;
  const mac = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifyStripeWebhook(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  toleranceSec?: number;
}): { ok: boolean; detail: string } {
  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, detail: "Malformed Stripe signature" };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - t);
  if (skew > (input.toleranceSec ?? 300)) {
    return { ok: false, detail: "Timestamp outside allowed skew" };
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${t}.${input.rawBody}`)
    .digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, detail: "Invalid Stripe signature" };
  }
  return { ok: true, detail: "ok" };
}

export function signRazorpayWebhook(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Live DNS TXT lookup for custom-domain verification (Node only). */
export async function defaultDnsTxtLookup(hostname: string): Promise<string[]> {
  try {
    const records = await resolveTxt(hostname);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

export function verifyRazorpayWebhook(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
}): { ok: boolean; detail: string } {
  const expected = signRazorpayWebhook(input.rawBody, input.secret);
  const a = Buffer.from(input.signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, detail: "Invalid Razorpay signature" };
  }
  return { ok: true, detail: "ok" };
}
