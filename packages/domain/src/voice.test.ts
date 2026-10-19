import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptOutboundCall,
  authorizeVoiceProvider,
  classifyCallOutcomeScaffold,
  scaffoldCallTranscription,
} from "./voice";

test("voice without credentials is pending_configuration", () => {
  const prev = process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  try {
    const a = authorizeVoiceProvider("twilio");
    assert.equal(a.status, "pending_configuration");
    const call = attemptOutboundCall({
      provider: "twilio",
      legalOutboundAllowed: true,
      recordingConsent: true,
    });
    assert.equal(call.status, "pending_configuration");
    assert.equal(call.providerCallId, null);
  } finally {
    if (prev) process.env.TWILIO_AUTH_TOKEN = prev;
  }
});

test("outbound blocked when not legally permitted", () => {
  const call = attemptOutboundCall({
    provider: "twilio",
    legalOutboundAllowed: false,
    recordingConsent: true,
  });
  assert.equal(call.status, "pending_configuration");
  assert.match(call.detail, /not legally permitted/i);
});

test("transcription skipped without consent", () => {
  const t = scaffoldCallTranscription({
    hasRecording: true,
    recordingConsent: false,
  });
  assert.equal(t.transcriptStatus, "skipped");
});

test("outcome classification scaffold", () => {
  assert.equal(
    classifyCallOutcomeScaffold({ appointmentBooked: true }),
    "appointment_booked",
  );
  assert.equal(
    classifyCallOutcomeScaffold({ transferred: true }),
    "transferred_human",
  );
});
