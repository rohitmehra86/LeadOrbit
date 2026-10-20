import assert from "node:assert/strict";
import { test } from "node:test";
import { signWebhookPayload } from "@leadorbit/domain/server";
import { PartnerWebhookStore } from "./partner-webhook-store";
import { LocalTenancyStore } from "./tenancy-store";
import { resetCrmDatabaseForTests } from "./sqlite";
import { SqliteJobQueue } from "./job-queue";

async function setup() {
  const db = resetCrmDatabaseForTests(":memory:");
  const tenancy = new LocalTenancyStore();
  const signed = await tenancy.signUp({
    email: `pw-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
  });
  const owner = (await tenancy.getUser(signed.id))!;
  const org = await tenancy.createOrganization(owner, {
    name: "Partner Co",
    orgType: "agency",
  });
  const queue = new SqliteJobQueue(db);
  const store = new PartnerWebhookStore(tenancy, db, queue);
  return { owner, org, store, queue };
}

test("outbound subscription emit is idempotent and delivers on 2xx", async () => {
  const { owner, org, store } = await setup();
  const sub = await store.createSubscription(owner, org.id, {
    name: "Zapier",
    targetUrl: "http://127.0.0.1:9999/hook",
    eventTypes: ["partner.test", "lead.created"],
  });
  assert.ok(sub.secret.startsWith("pwhsec_"));

  const first = await store.emitEvent(org.id, {
    eventType: "partner.test",
    eventId: "evt_same",
    data: { hello: true },
  });
  assert.equal(first.enqueued, 1);

  const dup = await store.emitEvent(org.id, {
    eventType: "partner.test",
    eventId: "evt_same",
    data: { hello: true },
  });
  assert.equal(dup.enqueued, 0);

  const deliveryId = first.deliveries[0]!.id;
  const delivered = await store.processDelivery(
    org.id,
    deliveryId,
    async () => new Response("ok", { status: 200 }),
  );
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.lastStatusCode, 200);
});

test("outbound retries then dead_letters on persistent failure", async () => {
  const { owner, org, store } = await setup();
  await store.createSubscription(owner, org.id, {
    name: "Failing hook",
    targetUrl: "http://127.0.0.1:9999/fail",
    eventTypes: ["partner.test"],
  });
  const { deliveries } = await store.emitEvent(org.id, {
    eventType: "partner.test",
    eventId: "evt_fail",
    data: {},
  });
  const id = deliveries[0]!.id;
  let d = await store.processDelivery(
    org.id,
    id,
    async () => new Response("err", { status: 500 }),
  );
  assert.equal(d.status, "retrying");
  d = await store.processDelivery(
    org.id,
    id,
    async () => new Response("err", { status: 500 }),
  );
  assert.equal(d.status, "retrying");
  d = await store.processDelivery(
    org.id,
    id,
    async () => new Response("err", { status: 500 }),
  );
  assert.equal(d.status, "dead_letter");
});

test("inbound partner webhook verifies signature and is idempotent", async () => {
  const { owner, org, store } = await setup();
  const { secret } = await store.ensureInboundSecret(owner, org.id);
  const body = JSON.stringify({ id: "in_1", type: "external.sync", foo: 1 });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = signWebhookPayload(secret, ts, body);

  const bad = store.processInboundWebhook({
    orgId: org.id,
    partner: "zapier",
    eventId: "in_1",
    eventType: "external.sync",
    rawBody: body,
    timestamp: ts,
    signature: "sha256=deadbeef",
  });
  assert.equal(bad.accepted, false);

  const ok = store.processInboundWebhook({
    orgId: org.id,
    partner: "zapier",
    eventId: "in_1",
    eventType: "external.sync",
    rawBody: body,
    timestamp: ts,
    signature: sig,
  });
  assert.equal(ok.accepted, true);
  assert.equal(ok.duplicate, false);

  const again = store.processInboundWebhook({
    orgId: org.id,
    partner: "zapier",
    eventId: "in_1",
    eventType: "external.sync",
    rawBody: body,
    timestamp: ts,
    signature: sig,
  });
  assert.equal(again.accepted, true);
  assert.equal(again.duplicate, true);
});
