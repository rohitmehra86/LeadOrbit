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
