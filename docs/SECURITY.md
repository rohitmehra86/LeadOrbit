# LeadOrbit — Security notes

Honest operational guidance for local and production setups. This is not a compliance certification.

## Secrets

| Secret | Purpose | Notes |
|--------|---------|-------|
| `SESSION_SECRET` | HMAC key for local JWT session cookie | **Required in production.** Default `leadorbit-local-dev-only-change-me` is rejected when `NODE_ENV=production`. |
| `DEV_SESSION_SECRET` | Alias for local only | Prefer `SESSION_SECRET`. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing | Never commit. Without these, checkout stays `pending_configuration`. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Billing | Same as Stripe. |
| `LLM_API_KEY` / `OPENAI_API_KEY` | AI gateway | Absent → `pending_configuration`, not fake success. |
| Supabase URL / anon / service role | Auth + RLS | Service role must never ship to the browser. |

**Rules**

- Do not store raw card numbers, PANs, or CVV — payment providers tokenize.
- Do not activate subscriptions from client-only success callbacks; verified webhooks only.
- Rotate webhook secrets if leaked; idempotency keys prevent double-apply on replay.

## Session cookies (local auth)

- `httpOnly`, `sameSite=lax`, `secure` in production, path `/`, host-only.
- JWT expiry 7 days; platform-admin flag refreshed from store on each read.

## CSRF

Mutating `/api/*` requests (except signed webhooks / public ingest) are checked for `Origin`/`Referer` against an allowlist (`CSRF_ALLOWED_ORIGINS`, request origin, localhost:43127).

- Local curl without Origin is allowed unless `CSRF_STRICT=1`.
- Set `CSRF_STRICT=1` in shared staging/production.

## Rate limiting

In-memory sliding window in middleware (per edge isolate):

- `RATE_LIMIT_PER_WINDOW` (default 120)
- `RATE_LIMIT_WINDOW_MS` (default 60000)

Replace with Redis / edge KV before multi-instance production.

## Headers

`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, plus **CSP Report-Only** scaffold (enforcement needs nonces).

## RLS

Postgres RLS policies live under `supabase/migrations`. Local domain data uses SQLite + service-layer org gates. Live RLS verification is **blocked** until a Supabase project is linked.

## Dependency scanning

CI runs `pnpm audit --audit-level=high`. Treat failures as merge blockers for new high/critical advisories; document temporary waivers in the PR if a transitive package has no fix.

## Privacy scaffolding

- `POST /api/v1/orgs/:id/privacy/export` — JSON export package (scaffolded)
- `POST /api/v1/orgs/:id/privacy/delete-request` — deletion request (requires `confirm: "DELETE"`; purge not auto-run)
