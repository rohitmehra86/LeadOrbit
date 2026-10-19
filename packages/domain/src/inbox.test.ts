import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptProviderSend,
  authorizeMessagingChannel,
} from "./inbox";
import { signMessagingWebhook, verifyMessagingWebhook } from "./server";

test("messaging webhook signature validates", () => {
  const secret = "msgsec";
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"text":"hi"}';
  const sig = signMessagingWebhook(secret, ts, body);
  assert.equal(
    verifyMessagingWebhook({
      secret,
      timestamp: ts,
      rawBody: body,
      signature: sig,
    }).ok,
    true,
  );
  assert.equal(
    verifyMessagingWebhook({
      secret,
      timestamp: ts,
      rawBody: body,
      signature: "sha256=00",
    }).ok,
    false,
  );
});

test("attemptProviderSend never fakes live delivery without creds", () => {
  const r = attemptProviderSend({
    channel: "whatsapp",
    to: "+15551212",
    body: "Hello",
  });
  assert.equal(r.deliveryStatus, "pending_configuration");
  assert.equal(r.providerMessageId, null);
});

test("website_chat authorize ready; whatsapp pending without token", () => {
  assert.equal(authorizeMessagingChannel("website_chat").status, "ready");
  assert.equal(
    authorizeMessagingChannel("whatsapp").status,
    "pending_configuration",
  );
});

test("testMode send marks sent without claiming provider delivery", () => {
  const r = attemptProviderSend({
    channel: "email",
    to: "a@b.co",
    body: "t",
    testMode: true,
  });
  assert.equal(r.deliveryStatus, "sent");
  assert.ok(r.providerMessageId?.startsWith("test_"));
});
