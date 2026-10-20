# LeadOrbit — Feature Superiority Roadmap

**Last updated:** 2026-10-20  
**Vision:** AI-first marketing/sales/revenue cloud that matches ICP-relevant competitor capability and wins on **time-to-value** and **operator simplicity** — not on Salesforce platform depth.

---

## North-star journeys

1. **Launch** — goal → campaign assets → public capture → CRM lead → qualify → Results signal  
2. **Convert** — lead → nurture/workflow → appointment → won deal  
3. **Operate** — inbox + calendar + team roles without leaving shell  
4. **Scale** — multi-org agency, white-label, entitlements, durable cloud  

---

## Sequenced program

### Wave 0 — Foundation honesty (done / continuous)

- Monorepo, local SQLite domain stores, worker queue, RLS SQL migrations, auth (local + Supabase session path)

### Wave 1 — AI-first shell + Launch Pack E2E ✅

### Wave 2 — Durable cloud + convert loop ✅

### Wave 3 — Depth + templates ✅ (partial honesty)

- Advanced Postgres adapters, invites, convert_loop, AI shell polish  
- Staging Playwright vs Supabase still blocked without Redeploy/session  

### Wave 4 — Demand + messaging parity ✅ (cred-gated honesty)

- [x] Meta/Google Lead Ads adapters + setup hints + fixture ingest tests  
- [x] Messaging delivery scaffolding + WhatsApp verify challenge; blocked without creds  
- [x] Calendar OAuth start URLs + honest callback (no fake connect)  
- [x] Ad spend on Results: unavailable vs zero vs reported  
- [x] `public/leads` durable path (`00015` ingest_public_lead + org_capture_tokens)  
- [ ] Live Ads/Messaging/Calendar HTTP verified in production (**blocked** on credentials)

### Wave 5 — Agency scale ✅ (cred-gated honesty)

- [x] Stripe + Razorpay checkout adapters (pending without keys; session URL only when provider HTTP succeeds)  
- [x] Verified webhook idempotency — **never activate from client-only success**  
- [x] White-label brand polish + branded login (`/p/[orgId]/login`) + domain TXT verify scaffold  
- [x] Platform admin: tenants, usage, flags, audit (restricted)  
- [x] Usage metering (`consumeQuota` / AI credits) with entitlements gates on AI + messaging  
- [ ] Live Stripe/Razorpay + custom-domain TLS/email in production (**blocked** on credentials / DNS)

### Wave 6 — Ecosystem

- Zapier/n8n outbound webhooks + trigger catalog  
- Public OpenAPI completeness for partners  
- Marketplace of Launch Pack templates (vertical packs)  

### Explicit non-goals (near term)

- Salesforce-class custom platform / SOQL  
- Full Marketing Cloud journey canvas parity  
- Claiming “complete GHL replacement” before live provider Waves  
- Linkbook project (`ipxflpzfcqwtenodbxwc`) — out of scope  

---

## Priority stack (dependency-aware)

| Pri | Item | Depends on |
|-----|------|------------|
| P0 | Honest status / blocked markers | — |
| P1 | Durable public capture (forms + public/leads) | Supabase migrations |
| P2 | Live provider adapters (ads/msg/calendar) | Credentials |
| P2 | Agency white-label live | Billing |
| P3 | Ecosystem Zapier/n8n | Stable public APIs |

---

## Success metrics (instrument later)

- Time to first published capture URL < 5 minutes (Simple)  
- % of new orgs with ≥1 lead in 7 days  
- Assistant tool success rate (executed vs failed)  
- Zero unauthorized publishes (approval bypass incidents = 0)  
- Zero fake provider “delivered” without credentials  
