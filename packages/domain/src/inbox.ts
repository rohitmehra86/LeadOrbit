/** Milestone 6 — unified communications / inbox */

export type InboxChannel =
  | "whatsapp"
  | "email"
  | "sms"
  | "website_chat"
  | "messenger"
  | "instagram"
  | "voice";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export type MessageDirection = "inbound" | "outbound" | "internal";

export type MessageDeliveryStatus =
  | "queued"
  | "pending_configuration"
  | "sent"
  | "delivered"
  | "failed"
  | "opted_out";

export type ProviderConnectionStatus =
  | "pending_configuration"
  | "authorized_stub"
  | "ready"
  | "error";

export interface Conversation {
  id: string;
  orgId: string;
  channel: InboxChannel;
  subject: string | null;
  status: ConversationStatus;
  assigneeUserId: string | null;
  leadId: string | null;
  contactAddress: string | null;
  unreadCount: number;
  tags: string[];
  slaDueAt: string | null;
  lastMessageAt: string | null;
  consentOk: boolean;
  optedOut: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  orgId: string;
  conversationId: string;
  direction: MessageDirection;
  channel: InboxChannel;
  body: string;
  htmlBody: string | null;
  templateKey: string | null;
  attachmentPaths: string[];
  deliveryStatus: MessageDeliveryStatus;
  providerMessageId: string | null;
  senderUserId: string | null;
  isInternalNote: boolean;
  error: string | null;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  orgId: string;
  channel: InboxChannel;
  key: string;
  name: string;
  body: string;
  createdAt: string;
}

export interface ChannelConnection {
  id: string;
  orgId: string;
  channel: InboxChannel;
  status: ProviderConnectionStatus;
  webhookSecret: string | null;
  config: Record<string, unknown>;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OptOutRecord {
  id: string;
  orgId: string;
  channel: InboxChannel;
  address: string;
  createdAt: string;
}

export function messagingProviderCredentialsPresent(
  channel: InboxChannel,
): boolean {
  switch (channel) {
    case "whatsapp":
      return Boolean(process.env.WHATSAPP_TOKEN);
    case "email":
      return Boolean(process.env.SMTP_URL || process.env.RESEND_API_KEY);
    case "sms":
      return Boolean(process.env.TWILIO_AUTH_TOKEN);
    case "messenger":
    case "instagram":
      return Boolean(process.env.META_MESSAGING_TOKEN);
    case "website_chat":
      return true; // first-party channel
    case "voice":
      return Boolean(process.env.TWILIO_AUTH_TOKEN);
    default:
      return false;
  }
}

export function authorizeMessagingChannel(
  channel: InboxChannel,
): { status: ProviderConnectionStatus; detail: string } {
  if (channel === "website_chat") {
    return { status: "ready", detail: "First-party website chat ready" };
  }
  if (!messagingProviderCredentialsPresent(channel)) {
    return {
      status: "pending_configuration",
      detail: `${channel} credentials missing — provider adapter stub only`,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${channel} authorize stub accepted; live production delivery not claimed`,
  };
}

/** Attempt outbound send — never reports production success without credentials. */
export function attemptProviderSend(input: {
  channel: InboxChannel;
  to: string;
  body: string;
  testMode?: boolean;
}): {
  deliveryStatus: MessageDeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
} {
  if (input.testMode) {
    return {
      deliveryStatus: "sent",
      providerMessageId: `test_${Date.now()}`,
      error: null,
    };
  }
  const auth = authorizeMessagingChannel(input.channel);
  if (auth.status === "pending_configuration") {
    return {
      deliveryStatus: "pending_configuration",
      providerMessageId: null,
      error: auth.detail,
    };
  }
  // Credentials present but live provider HTTP not wired — do not fake delivered.
  return {
    deliveryStatus: "pending_configuration",
    providerMessageId: null,
    error: `${input.channel} adapter authorized stub only — live send not implemented (to=${input.to})`,
  };
}
