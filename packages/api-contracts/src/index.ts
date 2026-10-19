export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
  timestamp?: string;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
};

export type OrganizationDto = {
  id: string;
  name: string;
  slug: string;
  orgType: "agency" | "workspace";
  parentOrgId: string | null;
};

export type CreateOrganizationRequest = {
  name: string;
  orgType?: "agency" | "workspace";
};

export const API_VERSION = "v1" as const;

export function problem(
  status: number,
  title: string,
  detail?: string,
): ProblemDetails {
  return {
    type: `https://leadorbit.dev/problems/${status}`,
    title,
    status,
    detail,
  };
}
