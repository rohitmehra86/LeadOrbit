# LeadOrbit — Implementation Status

**Last updated:** 2026-10-20  
**Current focus:** Wave 3 — Advanced Postgres/Supabase ports + convert templates  
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

## Wave 3 — Advanced adapters + templates (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Migration `00014_wave3_advanced_adapters` | **Verified** (applied on LeadOrbit `kqmuxocbmtydkxdvmypy`) | `assignment_rules`, `follow_up_reminders`, `ensure_org_pipelines`, `accept_org_invite`, `seed_convert_workflow_template` |
| `getCrmStore` / campaigns / workflows / inbox / ingestion mode switch | **Verified** in code | `AUTH_MODE=supabase` → Supabase adapters (cast); `local` unchanged SQLite |
| CRM board (pipelines/stages/opps/contacts/companies/tasks/reminders/rules) | **Partial** | Supabase CRUD for board path; Expert CSV import/merge/export still honest `unsupported` |
| Marketing builders (forms/pages/funnels/creatives/events) | **Partial** | List/create/update/publish on Postgres; duplicate + ad authorize blocked honestly |
| Workflows + convert_loop template | **Verified** (local unit) | Domain `convertLoopWorkflow`; API `template: "convert_loop"`; Supabase seed RPC |
| Inbox | **Partial** | Conversations/messages/templates durable; outbound send `pending_configuration` without provider keys (no fake success) |
| Ingestion/attribution after public form | **Partial** | Hooks run in both modes; Meta/Google lead-ads / token `public/leads` still blocked |
| Team invites (Supabase) | **Verified** in code | `createInvite` writes `invites`; `acceptInvite` → `accept_org_invite` RPC |
| AI shell polish | **Verified** (local UI) | Starter chips, tool result list, typing state; ink/saffron retained |
| Staging Playwright vs Supabase | **Blocked here** | Agent cannot hit Vercel egress; needs Redeploy + session |

### Mode split

| Surface | `local` | `supabase` |
|---------|---------|------------|
| AI shell, Launch Pack, Leads/Results/Sales, public form/page | SQLite | Postgres |
| Advanced CRM board, marketing builders, workflows, inbox, ingestion | SQLite | **Postgres** (Wave 3) |
| Expert CSV merge/import, ad OAuth, messaging providers | SQLite / stubs | Honest errors / pending_configuration |

---

## Wave 2 — Durable adapters + convert loop (still current)

| Item | Status |
|------|--------|
| `00013` RPCs + Launch Pack domain adapters | Verified |
| Convert tools (qualify/assign/task/book) | Verified (local) |
| Meta/Google/WhatsApp/Stripe | Blocked |

---

## Credentials still needed

1. Vercel `leadorbit`: Redeploy `main`; `AUTH_MODE=supabase`; URL/anon/`SUPABASE_SERVICE_ROLE_KEY`  
2. Optional LLM keys for non-deterministic copy  
3. Meta/Google/WhatsApp/calendar OAuth/Stripe|Razorpay for live providers  
4. Egress `api.vercel.com` if agent should manage deploys  
5. Playwright staging: browser session against deployed Vercel + Supabase project  

Linkbook: **untouched**.

### Local runtime

- Web: http://127.0.0.1:43127  
- Worker: http://127.0.0.1:43128/health  

### Tests (Wave 3)

- `packages/domain` convert-loop template unit — expected pass  
- `apps/web` launch-pack + convert-loop + wave3-adapters — expected pass  
- Playwright local e2e — when server up; Supabase staging e2e **blocked**  

### Next (Wave 4)

- Meta/Google lead ads sync (replace stubs)  
- WhatsApp/SMS/email delivery adapters  
- Calendar OAuth  
- Ad spend reporting pull  
