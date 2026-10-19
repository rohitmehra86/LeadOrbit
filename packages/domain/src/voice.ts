/**
 * Milestone 8 — pluggable telephony / voice.
 * Real integrations only with authorized credentials; never fake live call success.
 */

export type VoiceProvider = "twilio" | "vonage" | "custom";

export type VoiceConnectionStatus =
  | "pending_configuration"
  | "authorized_stub"
  | "ready"
  | "error";

export type CallDirection = "inbound" | "outbound";

export type CallStatus =
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "busy"
  | "no_answer"
  | "canceled"
  | "transferred"
  | "pending_configuration";

export type CallOutcome =
  | "qualified"
  | "not_qualified"
  | "appointment_booked"
  | "callback_requested"
  | "transferred_human"
  | "voicemail"
  | "unknown";

export interface VoiceConnection {
  id: string;
  orgId: string;
  provider: VoiceProvider;
  status: VoiceConnectionStatus;
  fromNumber: string | null;
  detail: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceCall {
  id: string;
  orgId: string;
  provider: VoiceProvider;
  direction: CallDirection;
  status: CallStatus;
  fromNumber: string;
  toNumber: string;
  leadId: string | null;
  assigneeUserId: string | null;
  appointmentId: string | null;
  recordingConsent: boolean;
  recordingUrl: string | null;
  transcriptStatus: "pending" | "scaffolded" | "ready" | "failed" | "skipped";
  transcriptText: string | null;
  summary: string | null;
  outcome: CallOutcome;
  aiAssisted: boolean;
  durationSeconds: number | null;
  costUsd: number | null;
  legalOutboundAllowed: boolean;
  detail: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceAnalytics {
  totalCalls: number;
  inbound: number;
  outbound: number;
  completed: number;
  pendingConfiguration: number;
  transferred: number;
  appointmentsBooked: number;
  totalCostUsd: number;
  avgDurationSeconds: number | null;
}

export function telephonyCredentialsPresent(provider: VoiceProvider): boolean {
  switch (provider) {
    case "twilio":
      return Boolean(
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
      );
    case "vonage":
      return Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET);
    case "custom":
      return Boolean(process.env.CUSTOM_TELEPHONY_WEBHOOK_URL);
    default:
      return false;
  }
}

export function authorizeVoiceProvider(provider: VoiceProvider): {
  status: VoiceConnectionStatus;
  detail: string;
} {
  if (!telephonyCredentialsPresent(provider)) {
    return {
      status: "pending_configuration",
      detail: `${provider} credentials not configured`,
    };
  }
  return {
    status: "authorized_stub",
    detail: `${provider} credentials present but live call path not verified`,
  };
}

/**
 * Outbound calling scaffolding — must be legally permitted by org policy + credentials.
 * Never returns a fake live-success status.
 */
export function attemptOutboundCall(input: {
  provider: VoiceProvider;
  legalOutboundAllowed: boolean;
  recordingConsent: boolean;
}): {
  status: CallStatus;
  detail: string;
  providerCallId: string | null;
} {
  if (!input.legalOutboundAllowed) {
    return {
      status: "pending_configuration",
      detail: "Outbound calling not legally permitted for this org/policy",
      providerCallId: null,
    };
  }
  const auth = authorizeVoiceProvider(input.provider);
  if (auth.status === "pending_configuration") {
    return {
      status: "pending_configuration",
      detail: auth.detail,
      providerCallId: null,
    };
  }
  if (!input.recordingConsent) {
    return {
      status: "pending_configuration",
      detail: "Recording consent required before placing call with recording",
      providerCallId: null,
    };
  }
  return {
    status: "pending_configuration",
    detail:
      "Credentials present but live outbound dial not verified — not faking success",
    providerCallId: null,
  };
}

export function attemptInboundAccept(provider: VoiceProvider): {
  status: CallStatus;
  detail: string;
} {
  const auth = authorizeVoiceProvider(provider);
  if (auth.status === "pending_configuration") {
    return { status: "pending_configuration", detail: auth.detail };
  }
  return {
    status: "pending_configuration",
    detail:
      "Inbound webhook authorized stub — live media bridge not verified",
  };
}

export function scaffoldCallTranscription(input: {
  hasRecording: boolean;
  recordingConsent: boolean;
}): {
  transcriptStatus: VoiceCall["transcriptStatus"];
  transcriptText: string | null;
  summary: string | null;
  detail: string;
} {
  if (!input.recordingConsent) {
    return {
      transcriptStatus: "skipped",
      transcriptText: null,
      summary: null,
      detail: "Transcription skipped — no recording consent",
    };
  }
  if (!input.hasRecording) {
    return {
      transcriptStatus: "scaffolded",
      transcriptText: null,
      summary: null,
      detail: "Transcription scaffolded — no recording available",
    };
  }
  return {
    transcriptStatus: "scaffolded",
    transcriptText: null,
    summary: null,
    detail: "Transcription/summary scaffolded — STT provider not verified",
  };
}

export function classifyCallOutcomeScaffold(input: {
  textHints?: string;
  transferred?: boolean;
  appointmentBooked?: boolean;
}): CallOutcome {
  if (input.appointmentBooked) return "appointment_booked";
  if (input.transferred) return "transferred_human";
  const t = (input.textHints ?? "").toLowerCase();
  if (/\bcallback\b/.test(t)) return "callback_requested";
  if (/\bnot interested\b|\bno budget\b/.test(t)) return "not_qualified";
  if (/\bbudget\b|\btimeline\b|\binterested\b/.test(t)) return "qualified";
  if (/\bvoicemail\b/.test(t)) return "voicemail";
  return "unknown";
}

export function estimateCallCostUsd(
  durationSeconds: number | null,
  ratePerMinute = 0.015,
): number | null {
  if (durationSeconds == null || durationSeconds < 0) return null;
  const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
  return Number((minutes * ratePerMinute).toFixed(4));
}
