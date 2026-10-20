# LeadOrbit — Implementation Status

**Last updated:** 2026-10-20  
**Current focus:** Wave 5 — agency scale (billing, white-label, platform admin, metering)  
**Honesty policy:** Verified vs blocked vs not-deployed only. No fabricated parity claims. **Not commercially production-ready.**

---

## Legend

| Status | Meaning |
|--------|---------|
| **Verified** | Exercised here with evidence |
| **Blocked** | Needs credentials / vendor / network |
| **Partial** | Real code path; incomplete coverage |
| **Scaffolded** | Config/docs/code ready; not live-verified |

---

## Wave 5 — Agency scale (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Stripe Checkout adapter | **Partial** | `createStripeCheckoutSession` — pending without keys; scaffolded without price ids; live session via HTTP when price + secret set. **Never activates from client success** |
| Razorpay payment-link adapter | **Partial** | Same honesty; webhook + notes.orgId activate only |
| Webhook idempotency | **Verified** (unit) | Duplicate `event_id` accepted once; bad signatures rejected |
| White-label brand + branded login | **Verified** (local) | `/p/[orgId]/login` + public branding API; host map scaffold |
| Domain DNS verify | **Partial** | TXT challenge + `verifyDomain` / dns-verify adapter; live DNS needs public records |
| Platform admin (tenants/usage/flags/audit) | **Verified** (local) | `/platform` tabs + restricted APIs; audited flag writes |
| Usage metering + entitlements gates | **Verified** (unit) | `consumeQuota` / `consumeAiCredits`; AI assistant + inbox outbound gated |
| Live Stripe/Razorpay charge in prod | **Blocked** | Needs real keys + price/plan ids + webhook endpoints on Vercel |
| Live custom-domain TLS / email send | **Blocked** | DNS + email provider wiring |

### Mode split

| Surface | `local` | `supabase` |
|---------|---------|------------|
| Billing store | SQLite | Still SQLite billing store (Supabase billing tables exist; app path not switched) |
| White-label | SQLite + branded login | Brand tables in `00011`; local store used today |
| Platform flags/audit | In-memory tenancy audit | Needs platform RLS APIs for full parity |
| Metering gates | BillingStore + tenancy mirror | Same when AUTH_MODE=local; AI/inbox gates on local stores |

---

## Wave 4 — Demand + messaging (still current)

| Item | Status |
|------|--------|
| Lead ads / messaging / calendar / ad spend / public/leads | Verified unit + partial durable; live HTTP **Blocked** on credentials |

---

## Credentials still needed

1. Vercel Redeploy `main` with `AUTH_MODE=supabase` + Supabase URL/anon/`SUPABASE_SERVICE_ROLE_KEY`  
2. Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`  
3. Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`  
4. Meta/Google/WhatsApp/Email/SMS/Calendar keys (Wave 4)  
5. Optional LLM keys  

Linkbook: **untouched**.

### Local runtime

- Web: http://127.0.0.1:43127  

### Tests (Wave 5)

- Domain adapters (Wave 4 + Wave 5) — pass  
- Billing store (webhook idempotency, consumeQuota, checkout honesty) — pass  
- White-label domain verify — pass  
- Convert-loop assistant (entitlement-gated) — pass  
- Typecheck domain/db/web — clean  

### Next (Wave 6)

- Zapier/n8n outbound webhooks + event catalog  
- Public OpenAPI completeness for partners  
- Marketplace of Launch Pack templates (vertical packs)  
