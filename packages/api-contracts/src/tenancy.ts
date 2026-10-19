export type MembershipRoleDto =
  | "owner"
  | "admin"
  | "manager"
  | "agent"
  | "viewer";

export type OrgTypeDto = "agency" | "workspace";

export type SessionDto = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    isPlatformAdmin: boolean;
  };
  authMode: "local" | "supabase";
  supabaseConfigured: boolean;
};

export type OrganizationDto = {
  id: string;
  name: string;
  slug: string;
  orgType: OrgTypeDto;
  parentOrgId: string | null;
  timezone: string;
  locale: string;
  currency: string;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    supportEmail: string | null;
  };
};

export type CreateOrganizationRequest = {
  name: string;
  orgType?: OrgTypeDto;
  timezone?: string;
  locale?: string;
  currency?: string;
};

export type MembershipDto = {
  id: string;
  orgId: string;
  userId: string;
  role: MembershipRoleDto;
  status: string;
};

export type InviteDto = {
  id: string;
  orgId: string;
  email: string;
  role: MembershipRoleDto;
  status: string;
  expiresAt: string;
  token?: string;
};

export type CreateInviteRequest = {
  email: string;
  role: Exclude<MembershipRoleDto, "owner">;
};

export type UpdateOrgSettingsRequest = {
  name?: string;
  timezone?: string;
  locale?: string;
  currency?: string;
  branding?: {
    logoUrl?: string | null;
    primaryColor?: string | null;
    accentColor?: string | null;
    supportEmail?: string | null;
  };
};
