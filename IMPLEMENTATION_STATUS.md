# LeadOrbit — Implementation Status

**Last updated:** 2026-10-20  
**Current focus:** Wave 2 — durable Supabase domain adapters + convert loop  
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

## Wave 2 — Durable adapters + convert loop (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Migration `00013_wave2_domain_adapters` | **Verified** (applied on LeadOrbit `kqmuxocbmtydkxdvmypy`) | `submit_public_form`, `ensure_org_lead_pipeline`, `book_lead_appointment`; anon read published forms/pages |
| `SupabaseCrmStore` (leads/tasks/assign/score/book) | **Verified** in code + typecheck | Used when `AUTH_MODE=supabase` via `getDomainCrm()` |
| `SupabaseCampaignStore` (campaigns/forms/pages/public submit) | **Verified** in code + typecheck | Used via `getDomainCampaigns()` |
| AUTH_MODE=local unchanged | **Verified** | Launch Pack + convert-loop tests pass on SQLite |
| Live staging E2E (signup→launch→submit on Vercel) | **Partial / blocked here** | Needs Redeploy + session against Supabase; agent cannot hit Vercel egress |
| Advanced CRM/Marketing UIs | **Partial** | Still call local `getCrmStore()` / `getCampaignStore()` — Expert modules not fully Postgres yet |
| Ingestion/workflow hooks after public submit | **Partial** | Run on local only; skipped in supabase mode until those adapters ship |
| Convert tools (qualify/assign/task/book) | **Verified** (local) | Assistant approvals; calendar OAuth still blocked |
| Meta/Google/WhatsApp/Stripe | **Blocked** | Unchanged stubs |

### Mode split (important)

| Surface | `local` | `supabase` |
|---------|---------|------------|
| AI shell, Launch Pack, Leads/Results/Sales simple, public form/page | SQLite | **Postgres** |
| Advanced CRM board, full marketing builders, inbox, workflows UI | SQLite | Still SQLite (non-durable on Vercel) |

---

## Wave 1 — AI-first shell (still current)

| Item | Status |
|------|--------|
| 6-nav + Simple/Advanced/Expert | Verified (local) |
| Assistant typed tools + approval | Verified (local); convert tools added |
| Launch Pack E2E | Verified (local) |
| Product docs under `docs/product/` | Verified |

---

## Credentials still needed

1. Vercel `leadorbit`: Redeploy `main`; `AUTH_MODE=supabase`; URL/anon/`SUPABASE_SERVICE_ROLE_KEY`  
2. Optional LLM keys for non-deterministic copy  
3. Meta/Google/WhatsApp/calendar OAuth/Stripe|Razorpay for live providers  
4. Egress `api.vercel.com` if agent should manage deploys  

Linkbook: **untouched**.

### Local runtime

- Web: http://127.0.0.1:43127  
- Worker: http://127.0.0.1:43128/health  

### Tests (Wave 2)

- `packages/domain/src/assistant.test.ts` — pass  
- `apps/web/src/lib/launch/launch-pack.test.ts` — pass  
- `apps/web/src/lib/assistant/convert-loop.test.ts` — pass  

### Next (Wave 3)

- Supabase adapters for Advanced CRM/marketing/workflows/inbox/ingestion  
- Guided onboarding checklist persistence  
- Workflow templates in Simple mode  
- Optional LLM when keyed  
