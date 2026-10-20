/**
 * Usage metering helpers for AI / messaging entitlements.
 * Pure helpers — stores persist; never invents unlimited when a limit exists.
 */

import { quotaExceeded } from "../billing";

export const USAGE_METRICS = {
  leadsCreated: "leads_created",
  aiJobs: "ai_jobs",
  messagesSent: "messages_sent",
} as const;

export type UsageMetric =
  (typeof USAGE_METRICS)[keyof typeof USAGE_METRICS];

export type QuotaBucket = { limit: number; used: number };

/** Check whether increment would exceed limit. limit < 0 = unlimited. */
export function canConsumeQuota(
  bucket: QuotaBucket | null | undefined,
  increment = 1,
): { ok: true } | { ok: false; reason: string } {
  if (!bucket) {
    return { ok: false, reason: "Quota metric not configured" };
  }
  if (quotaExceeded(bucket.used + increment - 1, bucket.limit)) {
    return { ok: false, reason: "Quota exceeded" };
  }
  return { ok: true };
}

/** Return next bucket after a successful consume (does not mutate). */
export function applyQuotaIncrement(
  bucket: QuotaBucket,
  increment = 1,
): QuotaBucket {
  return { limit: bucket.limit, used: bucket.used + increment };
}

export function canConsumeAiCredits(input: {
  included: number;
  used: number;
  credits?: number;
}): { ok: true } | { ok: false; reason: string } {
  const credits = input.credits ?? 1;
  if (input.included < 0) return { ok: true }; // unlimited
  if (input.used + credits > input.included) {
    return { ok: false, reason: "AI credits exhausted" };
  }
  return { ok: true };
}

export function applyAiCreditsIncrement(
  used: number,
  credits = 1,
): number {
  return used + credits;
}

/** Default trial quotas seeded for Wave 5 metering. */
export function defaultTrialUsageQuotas(): Record<string, QuotaBucket> {
  return {
    [USAGE_METRICS.leadsCreated]: { limit: 1000, used: 0 },
    [USAGE_METRICS.aiJobs]: { limit: 100, used: 0 },
    [USAGE_METRICS.messagesSent]: { limit: 500, used: 0 },
  };
}
