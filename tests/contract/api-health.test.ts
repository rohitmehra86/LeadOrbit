/**
 * API contract smoke against a running server when BASE_URL is set;
 * otherwise validates problem-details constants via relative import.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { API_VERSION, problem } from "../../packages/api-contracts/src/index.ts";

const BASE = process.env.LEADORBIT_BASE_URL ?? process.env.BASE_URL;

test("problem details shape", () => {
  const p = problem(401, "Unauthorized", "login required");
  assert.equal(p.status, 401);
  assert.match(p.type, /401/);
  assert.equal(p.title, "Unauthorized");
});

test("API_VERSION is v1", () => {
  assert.equal(API_VERSION, "v1");
});

test("live health contract when server available", async (t) => {
  if (!BASE) {
    t.skip("LEADORBIT_BASE_URL not set — skipping live health check");
    return;
  }
  const res = await fetch(`${BASE.replace(/\/$/, "")}/api/v1/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    status: string;
    service: string;
    version: string;
    authMode?: string;
  };
  assert.equal(body.status, "ok");
  assert.equal(body.service, "leadorbit-web");
  assert.match(body.version, /^0\.12\.0-/);
  assert.ok(body.authMode === "local" || body.authMode === "supabase");
});

test("live unauthenticated org list is 401 when server available", async (t) => {
  if (!BASE) {
    t.skip("LEADORBIT_BASE_URL not set");
    return;
  }
  const res = await fetch(`${BASE.replace(/\/$/, "")}/api/v1/orgs`);
  assert.ok(res.status === 401 || res.status === 403);
  const ct = res.headers.get("content-type") ?? "";
  assert.match(ct, /json/);
});
