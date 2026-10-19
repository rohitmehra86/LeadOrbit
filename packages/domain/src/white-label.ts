/**
 * Milestone 10 — white labeling / agency branding.
 */

export type DomainVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "failed"
  | "scaffolded";

export interface WhiteLabelBrand {
  orgId: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  supportEmail: string | null;
  loginHeadline: string | null;
  emailFromName: string | null;
  emailFooter: string | null;
  hideLeadOrbitBranding: boolean;
  updatedAt: string;
}

export interface CustomDomain {
  id: string;
  orgId: string;
  hostname: string;
  status: DomainVerificationStatus;
  txtChallenge: string | null;
  detail: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyManagedOrg {
  id: string;
  agencyOrgId: string;
  childOrgId: string;
  label: string | null;
  createdAt: string;
}

export function startDomainVerification(hostname: string): {
  status: DomainVerificationStatus;
  txtChallenge: string;
  detail: string;
} {
  const normalized = hostname.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    return {
      status: "failed",
      txtChallenge: "",
      detail: "Invalid hostname",
    };
  }
  const token = `leadorbit-verify=${Buffer.from(normalized).toString("base64url").slice(0, 24)}`;
  return {
    status: "scaffolded",
    txtChallenge: token,
    detail:
      "DNS TXT verification scaffolded — live DNS lookup not performed in local runtime",
  };
}

/** Feature visibility by subscription — gates UI modules. */
export function visibleFeatures(
  features: Record<string, boolean> | null | undefined,
): string[] {
  if (!features) return [];
  return Object.entries(features)
    .filter(([, v]) => v)
    .map(([k]) => k);
}
