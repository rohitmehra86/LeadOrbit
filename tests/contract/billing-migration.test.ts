import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd());

test("00021 seeds plans, checkout lookup index, and service-role webhook RPC", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/00021_billing_plans_webhook_rpc.sql"),
    "utf8",
  );
  assert.match(sql, /insert into public\.billing_plans/);
  assert.match(sql, /starter_monthly/);
  assert.match(sql, /billing_invoices_provider_ref_uidx/);
  assert.match(sql, /create or replace function public\.apply_billing_webhook/);
  assert.match(sql, /grant execute on function public\.apply_billing_webhook/);
  assert.match(sql, /to service_role/);
  assert.match(sql, /Webhook already processed \(idempotent\)/);
  assert.match(sql, /claimed orgId has no matching checkout/);
  // Must not grant webhook apply to anon.
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.apply_billing_webhook\([^)]+\)\s+to anon/i,
  );
});

test("00011 still defines billing tables used by the adapter", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/00011_analytics_billing_white_label.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.org_subscriptions/);
  assert.match(sql, /create table if not exists public\.billing_invoices/);
  assert.match(sql, /create table if not exists public\.billing_webhook_events/);
  assert.match(sql, /unique \(provider, event_id\)/);
});
