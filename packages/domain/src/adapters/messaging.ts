/**
 * WhatsApp / email / SMS delivery scaffolding.
 * Never reports live delivery success without a verified provider HTTP adapter.
 */

import type { InboxChannel, MessageDeliveryStatus } from "../inbox";
import {
  attemptProviderSend,
  messagingProviderCredentialsPresent,
} from "../inbox";

export type MessagingProvider = "whatsapp" | "email" | "sms";

export function messagingSetupHints(channel: MessagingProvider): string[] {
  switch (channel) {
    case "whatsapp":
      return [
        "Set WHATSAPP_TOKEN (Cloud API)",
        "Set WHATSAPP_PHONE_NUMBER_ID",
        "Configure webhook verify token WHATSAPP_VERIFY_TOKEN",
      ];
    case "email":
      return [
        "Set RESEND_API_KEY or SMTP_URL",
        "Set EMAIL_FROM for outbound From header",
      ];
    case "sms":
      return [
        "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN",
        "Set TWILIO_FROM_NUMBER",
      ];
  }
}

export function isMessagingProvider(
  channel: InboxChannel,
): channel is MessagingProvider {
  return channel === "whatsapp" || channel === "email" || channel === "sms";
}

/**
 * Outbound send attempt — wraps attemptProviderSend with setup hints.
 * Live HTTP (Resend/Twilio/WhatsApp Cloud) is not claimed here.
 */
export function deliverOutboundMessage(input: {
  channel: InboxChannel;
  to: string;
  body: string;
  testMode?: boolean;
}): {
  deliveryStatus: MessageDeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
  setupHints: string[];
} {
  const result = attemptProviderSend(input);
  const hints =
    isMessagingProvider(input.channel) &&
    !messagingProviderCredentialsPresent(input.channel)
      ? messagingSetupHints(input.channel)
      : isMessagingProvider(input.channel)
        ? messagingSetupHints(input.channel)
        : [];
  return { ...result, setupHints: hints };
}

/** Meta/WhatsApp webhook challenge verification (GET hub.challenge). */
export function verifyWhatsAppWebhookChallenge(input: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  expectedToken?: string | null;
}): { ok: true; challenge: string } | { ok: false; reason: string } {
  const expected =
    input.expectedToken ?? process.env.WHATSAPP_VERIFY_TOKEN ?? null;
  if (!expected) {
    return { ok: false, reason: "WHATSAPP_VERIFY_TOKEN not configured" };
  }
  if (input.mode !== "subscribe") {
    return { ok: false, reason: "hub.mode must be subscribe" };
  }
  if (!input.verifyToken || input.verifyToken !== expected) {
    return { ok: false, reason: "verify token mismatch" };
  }
  if (!input.challenge) {
    return { ok: false, reason: "missing hub.challenge" };
  }
  return { ok: true, challenge: input.challenge };
}
