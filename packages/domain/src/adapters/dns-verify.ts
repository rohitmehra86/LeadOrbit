/**
 * Custom domain DNS TXT verification scaffold.
 * Pure helpers only — no node: imports (client-safe via @leadorbit/domain barrel).
 * Live Node DNS lookup lives in @leadorbit/domain/server (`defaultDnsTxtLookup`).
 * Never marks verified without a matching TXT record.
 */

import type { DomainVerificationStatus } from "../white-label";

export type DnsTxtLookup = (hostname: string) => Promise<string[]>;

export type DomainVerifyResult = {
  status: DomainVerificationStatus;
  detail: string;
  recordsFound: string[];
};

/**
 * Verify that hostname publishes the expected TXT challenge.
 * Pass `lookup` from server (`defaultDnsTxtLookup`) or tests.
 * Without a lookup, stays `pending` — never invents verified.
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

  if (!input.lookup) {
    return {
      status: "pending",
      detail:
        "DNS lookup requires server runtime — pass defaultDnsTxtLookup from @leadorbit/domain/server",
      recordsFound: [],
    };
  }

  let records: string[];
  try {
    records = await input.lookup(hostname);
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
