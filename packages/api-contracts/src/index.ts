export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
  timestamp?: string;
  authMode?: "local" | "supabase";
  supabaseConfigured?: boolean;
  sessionSecretConfigured?: boolean;
  env?: string;
  queue?: Record<string, number>;
  monitors?: Record<string, unknown>;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
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

export * from "./tenancy";

