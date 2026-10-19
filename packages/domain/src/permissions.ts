import type { MembershipRole } from "./types";


/** Fine-grained permissions evaluated in API/service layer (and mirrored by RLS role checks). */
export type Permission =
  | "org:read"
  | "org:write"
  | "org:billing"
  | "members:read"
  | "members:invite"
  | "members:manage"
  | "settings:read"
  | "settings:write"
  | "flags:read"
  | "flags:write"
  | "audit:read"
  | "branding:write"
  | "leads:read"
  | "leads:write"
  | "platform:admin";

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  viewer: [
    "org:read",
    "members:read",
    "settings:read",
    "flags:read",
    "leads:read",
  ],
  agent: [
    "org:read",
    "members:read",
    "settings:read",
    "flags:read",
    "leads:read",
    "leads:write",
  ],
  manager: [
    "org:read",
    "members:read",
    "members:invite",
    "settings:read",
    "flags:read",
    "audit:read",
    "leads:read",
    "leads:write",
  ],
  admin: [
    "org:read",
    "org:write",
    "org:billing",
    "members:read",
    "members:invite",
    "members:manage",
    "settings:read",
    "settings:write",
    "flags:read",
    "flags:write",
    "audit:read",
    "branding:write",
    "leads:read",
    "leads:write",
  ],
  owner: [
    "org:read",
    "org:write",
    "org:billing",
    "members:read",
    "members:invite",
    "members:manage",
    "settings:read",
    "settings:write",
    "flags:read",
    "flags:write",
    "audit:read",
    "branding:write",
    "leads:read",
    "leads:write",
  ],
};

const ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 1,
  agent: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

export function permissionsForRole(role: MembershipRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: MembershipRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleAtLeast(
  role: MembershipRole,
  minimum: MembershipRole,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canManageMembers(role: MembershipRole): boolean {
  return hasPermission(role, "members:manage");
}

/** Owner cannot be demoted by non-owners; only owner can transfer ownership later. */
export function canAssignRole(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole] || actorRole === "owner";
}
