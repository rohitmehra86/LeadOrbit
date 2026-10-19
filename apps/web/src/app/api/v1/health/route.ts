import { NextResponse } from "next/server";
import type { HealthResponse } from "@leadorbit/api-contracts";
import { API_VERSION } from "@leadorbit/api-contracts";

export async function GET() {
  const body: HealthResponse = {
    status: "ok",
    service: "leadorbit-web",
    version: `0.1.0-${API_VERSION}`,
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body);
}
