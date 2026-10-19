import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("tenancy migration enables RLS and org membership helpers", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00002_tenancy.sql"),
    "utf8",
  );
  assert.match(sql, /enable row level security/);
  assert.match(sql, /private\.is_org_member/);
  assert.match(sql, /private\.has_org_permission/);
  assert.match(sql, /platform_admins/);
});

test("flags/entitlements/audit migration enables RLS", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00003_flags_entitlements_audit.sql"),
    "utf8",
  );
  assert.match(sql, /feature_flags/);
  assert.match(sql, /subscription_entitlements/);
  assert.match(sql, /usage_quotas/);
  assert.match(sql, /audit_logs/);
  assert.match(sql, /enable row level security/);
});

test("marketing migration enables RLS on campaigns/forms/pages", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00005_marketing_campaigns.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.campaigns/);
  assert.match(sql, /create table if not exists public\.forms/);
  assert.match(sql, /create table if not exists public\.landing_pages/);
  assert.match(sql, /private\.is_org_member/);
  assert.match(sql, /enable row level security/);
});

test("ingestion migration enables RLS on webhooks and attribution", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00006_ingestion_attribution.sql"),
    "utf8",
  );
  assert.match(sql, /webhook_endpoints/);
  assert.match(sql, /ingestion_events/);
  assert.match(sql, /attribution_touchpoints/);
  assert.match(sql, /lead_attribution/);
  assert.match(sql, /private\.is_org_member/);
  assert.match(sql, /enable row level security/);
});

test("workflows/inbox migration enables RLS", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00007_workflows_inbox.sql"),
    "utf8",
  );
  assert.match(sql, /durable_jobs/);
  assert.match(sql, /workflows/);
  assert.match(sql, /conversations/);
  assert.match(sql, /inbox_messages/);
  assert.match(sql, /private\.is_org_member/);
  assert.match(sql, /enable row level security/);
});

test("ai/knowledge migration enables RLS and pgvector", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00008_ai_knowledge.sql"),
    "utf8",
  );
  assert.match(sql, /create extension if not exists vector/);
  assert.match(sql, /knowledge_documents/);
  assert.match(sql, /knowledge_chunks/);
  assert.match(sql, /inventory_items/);
  assert.match(sql, /ai_personas/);
  assert.match(sql, /ai_usage_events/);
  assert.match(sql, /private\.is_org_member/);
  assert.match(sql, /enable row level security/);
});

test("calendar/voice migration enables RLS", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00009_calendar_voice.sql"),
    "utf8",
  );
  assert.match(sql, /appointment_types/);
  assert.match(sql, /appointments/);
  assert.match(sql, /calendar_connections/);
  assert.match(sql, /voice_calls/);
  assert.match(sql, /org_voice_policies/);
  assert.match(sql, /private\.is_org_member/);
  assert.match(sql, /enable row level security/);
});
