import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signMessagingWebhook } from "@leadorbit/domain";
import { AuthError, LocalTenancyStore } from "./tenancy-store";
import { openCrmDatabase } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";
import { InboxStore } from "./inbox-store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lo-inb-"));
  const db = openCrmDatabase(join(dir, "test.sqlite"));
  const tenancy = new LocalTenancyStore();
  const inbox = new InboxStore(tenancy, db, new SqliteJobQueue(db));
  return { tenancy, inbox, db };
}

test("cross-tenant inbox forbidden", async () => {
  const { tenancy, inbox } = setup();
  const alice = await tenancy.signUp({
    email: "a-inb@example.com",
    password: "password123",
  });
  const bob = await tenancy.signUp({
    email: "b-inb@example.com",
    password: "password123",
  });
  const orgA = await tenancy.createOrganization(alice, { name: "Org A Inbox" });
  await tenancy.createOrganization(bob, { name: "Org B Inbox" });
  await inbox.createConversation(alice, orgA.id, {
    channel: "email",
    contactAddress: "x@y.com",
  });
  await assert.rejects(
    () => inbox.listConversations(bob, orgA.id),
    (err: unknown) => err instanceof AuthError && err.code === "forbidden",
  );
});

test("messaging webhook signature + outbound pending without creds", async () => {
  const { tenancy, inbox } = setup();
  const owner = await tenancy.signUp({
    email: "owner-inb@example.com",
    password: "password123",
  });
  const org = await tenancy.createOrganization(owner, { name: "Inbox Co" });
  const connections = await inbox.listChannelConnections(owner, org.id);
  const email = connections.find((c) => c.channel === "email")!;
  assert.ok(email.webhookSecret);

  const body = JSON.stringify({ from: "lead@example.com", text: "Hello" });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = signMessagingWebhook(email.webhookSecret!, ts, body);
  const inbound = await inbox.processInboundWebhook({
    orgId: org.id,
    channel: "email",
    rawBody: body,
    timestamp: ts,
    signature: sig,
  });
  assert.ok(inbound.messageId);

  await assert.rejects(
    () =>
      inbox.processInboundWebhook({
        orgId: org.id,
        channel: "email",
        rawBody: body,
        timestamp: ts,
        signature: "sha256=00",
      }),
    (err: unknown) => err instanceof AuthError && err.code === "unauthorized",
  );

  const conv = await inbox.createConversation(owner, org.id, {
    channel: "whatsapp",
    contactAddress: "+15550001111",
  });
  const { message, jobId } = await inbox.addMessage(owner, org.id, {
    conversationId: conv.id,
    body: "Hi there",
  });
  assert.equal(message.deliveryStatus, "queued");
  assert.ok(jobId);
  inbox.processMessageSend(org.id, message.id);
  const msgs = await inbox.listMessages(owner, org.id, conv.id);
  assert.equal(msgs[0]!.deliveryStatus, "pending_configuration");

  const auth = await inbox.authorizeChannel(owner, org.id, "whatsapp");
  assert.equal(auth.status, "pending_configuration");
});
