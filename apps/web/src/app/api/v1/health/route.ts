import { NextResponse } from "next/server";
import type { HealthResponse } from "@leadorbit/api-contracts";
import { API_VERSION } from "@leadorbit/api-contracts";
import { authStatus } from "@/lib/auth/session";

export async function GET() {
  const status = authStatus();
  const body: HealthResponse = {
    status: "ok",
    service: "leadorbit-web",
    version: `0.3.0-${API_VERSION}`,
    timestamp: new Date().toISOString(),
    authMode: status.authMode,
    supabaseConfigured: status.supabaseConfigured,
  };
  return NextResponse.json(body);
}
