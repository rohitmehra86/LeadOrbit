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
- **Gap:** domain data not on Supabase adapters yet

### Wave 1 — AI-first shell + Launch Pack E2E (**this ship**)

| Item | Outcome |
|------|---------|
| 6-nav shell | Assistant · Leads · Marketing · Sales & Appointments · Results · Settings |
| Progressive disclosure | Simple / Advanced / Expert (cookie-persisted) |
| Assistant | Intent → clarify → plan → typed tools → approval → report |
| Launch Pack | Connected campaign + form + published page + public URL |
| Capture → qualify → Results | Public form submit → lead → deterministic score → Results |
| Visual system | Distinctive brand (not Inter/purple/cream clichés) |
| Tests | Launch Pack + assistant tool unit/API tests |

### Wave 2 — Durable cloud + invitations

- Supabase repository adapters for CRM, campaigns, forms, workflows, AI, analytics
- Invites on Supabase tenancy
- Staging E2E Playwright against durable project
- Fix `public/leads` 501 on supabase mode

### Wave 3 — Convert loop

- Appointment booking in Simple Sales view (local already exists — surface it)
- Workflow templates: form submit → qualify → task → reminder
- Inbox send when WhatsApp/ESP keys present (explicit blocked until then)
- Optional LLM qualify/copy when `OPENAI_API_KEY` / gateway configured

### Wave 4 — Demand + messaging parity (cred-gated)

- Meta/Google lead ads sync (replace stubs)
- Ad spend reporting pull
- WhatsApp/SMS/email delivery adapters
- Calendar OAuth (Google/Microsoft)

### Wave 5 — Agency scale

- Live Stripe + Razorpay checkout
- White-label domains + email
- Platform admin ops beyond tenant list
- Usage metering + soft limits

### Wave 6 — Ecosystem

- Zapier/n8n outbound webhooks + trigger catalog
- Public OpenAPI completeness for partners
- Marketplace of Launch Pack templates (vertical packs)

### Explicit non-goals (near term)

- Salesforce-class custom platform / SOQL
- Full Marketing Cloud journey canvas parity
- Claiming “complete GHL replacement” before Waves 2–4

---

## Priority stack (dependency-aware)

| Pri | Item | Depends on |
|-----|------|------------|
| P0 | AI shell + Launch Pack + Results signal | Existing campaign/CRM/AI stores |
| P0 | Honest status / blocked markers | — |
| P1 | Supabase domain adapters | Migrations (exist) |
| P1 | Guided onboarding checklist persistence | Orgs |
| P1 | Workflow templates in Simple mode | Workflows |
| P2 | Provider adapters (ads/msg/calendar/pay) | Credentials |
| P2 | Agency white-label live | Billing |
| P3 | Ecosystem Zapier/n8n | Stable public APIs |

---

## Success metrics (instrument later)

- Time to first published capture URL < 5 minutes (Simple)
- % of new orgs with ≥1 lead in 7 days
- Assistant tool success rate (executed vs failed)
- Zero unauthorized publishes (approval bypass incidents = 0)
