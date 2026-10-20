import { NextResponse } from "next/server";
import { verifyWhatsAppWebhookChallenge } from "@leadorbit/domain";

/** Meta WhatsApp Cloud API webhook verification (GET). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = verifyWhatsAppWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    verifyToken: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });
  if (!result.ok) {
    return NextResponse.json({ detail: result.reason }, { status: 403 });
  }
  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/**
 * Inbound WhatsApp events — signature verification required.
 * Without WHATSAPP_APP_SECRET, refuse (no fake processing).
 */
export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        detail:
          "WHATSAPP_APP_SECRET not configured — inbound WhatsApp webhook blocked (no fake success)",
      },
      { status: 501 },
    );
  }
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json({ detail: "Missing X-Hub-Signature-256" }, { status: 401 });
  }
  // Full HMAC body verify + lead/conversation ingest lands with live Meta app wiring.
  void request;
  return NextResponse.json(
    {
      detail:
        "WhatsApp signature header present and secret configured, but event ingest not verified — no leads invented",
      status: "pending_configuration",
    },
    { status: 501 },
  );
}
