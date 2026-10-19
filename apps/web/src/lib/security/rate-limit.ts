import { evaluateRateLimit } from "@leadorbit/domain";

type Bucket = number[];

const globalBuckets = globalThis as typeof globalThis & {
  __leadorbitRateBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalBuckets.__leadorbitRateBuckets) {
    globalBuckets.__leadorbitRateBuckets = new Map();
  }
  return globalBuckets.__leadorbitRateBuckets;
}

export function checkRateLimit(
  key: string,
  opts?: { limit?: number; windowMs?: number },
): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
} {
  const limit = opts?.limit ?? Number(process.env.RATE_LIMIT_PER_WINDOW ?? 120);
  const windowMs =
    opts?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const now = Date.now();
  const map = buckets();
  const hits = (map.get(key) ?? []).filter((t) => t > now - windowMs);
  const result = evaluateRateLimit({ hits, nowMs: now, windowMs, limit });
  if (result.allowed) {
    hits.push(now);
    map.set(key, hits);
  } else {
    map.set(key, hits);
  }
  return result;
}

/** Test helper */
export function resetRateLimitBuckets(): void {
  buckets().clear();
}
