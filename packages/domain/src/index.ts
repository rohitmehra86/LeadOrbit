export * from "./types";
export * from "./permissions";
export * from "./crm";
export * from "./campaigns";
export * from "./ingestion";


import type { MembershipRole } from "./types";
import { canManageMembers as canManageMembersImpl } from "./permissions";


export function canManageMembers(role: MembershipRole): boolean {
  return canManageMembersImpl(role);
}

export function clampLeadScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "");
}

export function slugifyOrgName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
