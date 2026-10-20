# LeadOrbit — Implementation Status

**Last updated:** 2026-10-20  
**Current focus:** Friend-demo docs + dual-org seed (`docs/demo/`); Wave 6 shipped  
**Honesty policy:** Verified vs blocked vs not-deployed only. No fabricated parity claims. **Not commercially production-ready.**

### Friend demos — Vercel (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Docs `docs/demo/*` (Vercel URLs only) | **Verified** | Store copies under `/cursor/stores/self/docs/demo-*.md` |
| Durable Supabase seed (2 orgs) | **Verified** (SQL via MCP) | `marketing.friend@test.com` / `broker.friend@test.com`; `scripts/seed-vercel-demo-orgs.sql` |
| Supabase RE + calendar adapters | **Code shipped** | Was SQLite-only on Vercel; now AUTH_MODE=supabase uses Postgres |
| Production signup/journey click-test | **Blocked** | Still `ERR_CONNECTION_CLOSED` (rechecked ~07:38 UTC). Broker meeting must use local fallback until Redeploy Ready |
| Meta / Google ads | **Blocked** | Needs provider credentials |

### Vercel production build (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Local `pnpm --filter @leadorbit/web build` | **Verified** | Was failing: `UnhandledSchemeError: node:dns/promises` via `@leadorbit/domain` → client `public-form.tsx`. Fixed by moving live DNS to `@leadorbit/domain/server`. |
| Vercel Production redeploy after fix | **Not verified here** | Agent cannot call Vercel API — Rohit must Redeploy `main` |

---

## Legend

| Status | Meaning |
|--------|---------|
| **Verified** | Exercised here with evidence |
| **Blocked** | Needs credentials / vendor / network |
| **Partial** | Real code path; incomplete coverage |
| **Scaffolded** | Config/docs/code ready; not live-verified |

---

## Wave 6 — Ecosystem (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Outbound partner webhooks (Zapier/n8n) | **Verified** (unit) | Signed HMAC delivery; `delivered` only on HTTP 2xx; retries → dead_letter; idempotent `(subscription, event_id)` |
| Inbound partner webhooks | **Verified** (unit) | Signature required; idempotent `(partner, event_id)` |
| Event catalog + Developers UI | **Verified** (local) | `/app/orgs/{orgId}/developers` |
| OpenAPI partner surface | **Verified** (contract test) | `packages/api-contracts/openapi/openapi.yaml` v0.6 + `docs/PARTNER_API.md` |
| Launch Pack marketplace | **Verified** (unit + local install path) | Industry packs install real draft Launch Packs; optional publish |
| Postgres mirror migration `00016` | **Scaffolded** | Tables + RLS select; app store still SQLite |
| Live Zapier/n8n production hooks | **Blocked** | Needs deployed URL + real Catch Hook endpoints |
| Supabase-backed partner store | **Blocked** | Await AUTH_MODE=supabase adapter wiring |

---

## Wave 5 — Agency scale (still current)

| Item | Status |
|------|--------|
| Stripe/Razorpay checkout adapters + webhook idempotency | Partial / verified unit — live charge **Blocked** on keys |
| White-label branded login + DNS verify | Partial |
| Platform admin usage/flags/audit | Verified local |
| AI/messaging metering gates | Verified unit |

---

## Credentials still needed (pause recommendation)

**Recommend pause for Rohit’s Vercel redeploy + provider keys before Wave 7** unless product wants pure local scaffolds only.

1. Vercel Redeploy `main` with `AUTH_MODE=supabase` + Supabase URL/anon/`SUPABASE_SERVICE_ROLE_KEY`  
2. Stripe / Razorpay keys + price ids + webhook URLs  
3. Meta / Google / WhatsApp / Email / SMS / Calendar (Wave 4)  
4. Optional: real Zapier/n8n Catch Hooks against the deployed host  

Linkbook: **untouched**.

### Local runtime

- Web: http://127.0.0.1:43127  

### Tests (Wave 6)

- Domain partner-webhooks + marketplace — pass  
- DB partner-webhook-store + marketplace-store — pass  
- OpenAPI contract — pass  
- Typecheck — clean  

### Next (Wave 7 candidates — after redeploy)

- Production webhook endpoints + partner OAuth apps  
- Supabase adapters for partner webhooks / marketplace installs  
- Rate-limit / partner API keys  
- Optional: public developer portal page  
