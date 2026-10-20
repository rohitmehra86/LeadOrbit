/**
 * Custom domain DNS TXT verification scaffold.
 * Live lookup uses Node dns when available; injectable for tests.
 * Never marks verified without a matching TXT record.
 */

import type { DomainVerificationStatus } from "../white-label";

export type DnsTxtLookup = (hostname: string) => Promise<string[]>;

export type DomainVerifyResult = {
  status: DomainVerificationStatus;
  detail: string;
  recordsFound: string[];
};

/** Default lookup — Node dns/promises when present; otherwise empty (scaffolded). */
export async function defaultDnsTxtLookup(hostname: string): Promise<string[]> {
  try {
    const dns = await import("node:dns/promises");
    const records = await dns.resolveTxt(hostname);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

/**
 * Verify that hostname publishes the expected TXT challenge.
 * Pass `lookup` in tests. When lookup yields no records and was the default
 * failure path, status stays `pending` (not verified).
 */
export async function verifyDomainTxtChallenge(input: {
  hostname: string;
  expectedToken: string;
  lookup?: DnsTxtLookup;
}): Promise<DomainVerifyResult> {
  const hostname = input.hostname.trim().toLowerCase();
  if (!input.expectedToken) {
    return {
      status: "failed",
      detail: "Missing TXT challenge token",
      recordsFound: [],
    };
  }

  const lookup = input.lookup ?? defaultDnsTxtLookup;
  let records: string[];
  try {
    records = await lookup(hostname);
  } catch (err) {
    return {
      status: "pending",
      detail:
        err instanceof Error
          ? `DNS lookup error: ${err.message}`
          : "DNS lookup error",
      recordsFound: [],
    };
  }

  const match = records.some(
    (r) => r.trim() === input.expectedToken || r.includes(input.expectedToken),
  );
  if (match) {
    return {
      status: "verified",
      detail: "TXT challenge matched",
      recordsFound: records,
    };
  }
  if (records.length === 0) {
    return {
      status: "pending",
      detail:
        "No TXT records found yet — publish the challenge and re-check (live DNS may lag)",
      recordsFound: [],
    };
  }
  return {
    status: "failed",
    detail: "TXT records present but challenge token not found",
    recordsFound: records,
  };
}

/** Resolve org id from hostname map (middleware / branded login scaffold). */
export function resolveOrgIdFromHostMap(
  hostname: string,
  hostToOrg: Record<string, string>,
): string | null {
  const key = hostname.trim().toLowerCase().split(":")[0] ?? "";
  return hostToOrg[key] ?? null;
}
