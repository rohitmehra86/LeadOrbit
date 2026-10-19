import { NextResponse } from "next/server";
import { problem } from "@leadorbit/api-contracts";

/**
 * Tenancy endpoints are stubbed until Milestone 2 (Supabase Auth + RLS).
 * Returning 501 avoids pretending the feature works.
 */
export async function GET() {
  return NextResponse.json(
    problem(501, "Not Implemented", "Organization listing requires Milestone 2 auth."),
    {
      status: 501,
      headers: { "content-type": "application/problem+json" },
    },
  );
}

export async function POST() {
  return NextResponse.json(
    problem(501, "Not Implemented", "Organization create requires Milestone 2 auth."),
    {
      status: 501,
      headers: { "content-type": "application/problem+json" },
    },
  );
}
