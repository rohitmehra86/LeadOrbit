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

| Item | Outcome |
|------|---------|
| 6-nav shell | Assistant · Leads · Marketing · Sales & Appointments · Results · Settings |
| Progressive disclosure | Simple / Advanced / Expert (cookie-persisted) |
| Assistant | Intent → clarify → plan → typed tools → approval → report |
| Launch Pack | Connected campaign + form + published page + public URL |
| Capture → qualify → Results | Public form submit → lead → deterministic score → Results |
| Visual system | Ink + saffron brand |
| Tests | Launch Pack + assistant tool unit/API tests |

### Wave 2 — Durable cloud + convert loop ✅

- [x] Supabase adapters for Launch Pack domain (campaigns/forms/pages/leads) via `getDomain*`
- [x] Migration RPCs: `submit_public_form`, `ensure_org_lead_pipeline`, `book_lead_appointment`
- [x] Convert tools: qualify→score, assign, follow-up task, book appointment/site visit
- [x] Sales simple view shows hot leads + open tasks

### Wave 3 — Depth + templates ✅ (partial honesty)

- [x] Advanced CRM/Marketing/Workflows/Inbox/Ingestion Postgres adapters (`AUTH_MODE=supabase`)
- [x] Migration `00014`: assignment_rules, follow_up_reminders, ensure_org_pipelines, accept_org_invite, convert template seed
- [x] Supabase team invites (create + accept RPC)
- [x] Workflow template `convert_loop` (form → qualify → task → notify)
- [x] AI shell polish (chips, tool results, typing) — ink/saffron kept
- [ ] Staging Playwright E2E against durable Vercel+Supabase (**blocked** without Redeploy/session)
- [ ] Expert CSV merge/import + ad OAuth + live inbox send (cred-gated / honest errors)
- [ ] Optional LLM qualify/copy when `OPENAI_API_KEY` configured

### Wave 4 — Demand + messaging parity (cred-gated)

- Meta/Google lead ads sync (replace stubs)
- Ad spend reporting pull
- WhatsApp/SMS/email delivery adapters
- Calendar OAuth (Google/Microsoft)
- Finish token `public/leads` capture on supabase mode

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
- Linkbook project (`ipxflpzfcqwtenodbxwc`) — out of scope

---

## Priority stack (dependency-aware)

| Pri | Item | Depends on |
|-----|------|------------|
| P0 | AI shell + Launch Pack + Results signal | Existing campaign/CRM/AI stores |
| P0 | Honest status / blocked markers | — |
| P1 | Supabase Advanced adapters | Wave 3 migrations |
| P1 | Convert workflow templates | Workflows |
| P2 | Provider adapters (ads/msg/calendar/pay) | Credentials |
| P2 | Agency white-label live | Billing |
| P3 | Ecosystem Zapier/n8n | Stable public APIs |

---

## Success metrics (instrument later)

- Time to first published capture URL < 5 minutes (Simple)
- % of new orgs with ≥1 lead in 7 days
- Assistant tool success rate (executed vs failed)
- Zero unauthorized publishes (approval bypass incidents = 0)
