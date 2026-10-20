# LeadOrbit — Implementation Status

**Last updated:** 2026-10-20  
**Current focus:** AI-first shell + Launch Pack E2E (Wave 1)  
**Honesty policy:** Verified vs blocked vs not-deployed only. No fabricated parity claims. **Not commercially production-ready.**

---

## Legend

| Status | Meaning |
|--------|---------|
| **Verified** | Exercised here with evidence |
| **Blocked** | Needs credentials / vendor / network |
| **Partial** | Real code path; incomplete or non-durable on staging |
| **Scaffolded** | Config/docs/code ready; not live-verified |
| **UI-only / stub** | Not claimed complete |

---

## Wave 1 — AI-first shell (2026-10-20)

| Item | Status | Notes |
|------|--------|-------|
| Product docs (`docs/product/*`) | Verified | Matrix, differentiation, roadmap |
| Org shell nav (6 primary) | Verified (local) | Assistant · Leads · Marketing · Sales · Results · Settings |
| Simple / Advanced / Expert modes | Verified (local) | Cookie `lo_ux_mode` |
| NL Assistant (typed tools + approval) | Verified (local) | `POST .../assistant/chat`; publish requires approval |
| Launch Pack (campaign+form+page) | Verified (local) | `POST .../launch` + assistant tools; test `launch-pack.test.ts` |
| Capture → CRM lead | Verified (local) | Public form submit |
| Results signals | Verified (local) | Lead/campaign/page counts |
| Visual refresh | Verified (local) | Fraunces + Manrope; ink/saffron system |
| Live LLM copy/qualify | **Blocked** | Gateway pending keys |
| Durable Supabase domain data | **Partial** | Auth/org OK; CRM/marketing still SQLite adapters |
| Meta/Google/WhatsApp/Stripe | **Blocked** | Stubs / pending_configuration |

### Verify locally

```bash
pnpm local:demo
# signup → create workspace → Assistant:
# “Launch a campaign for condo leads in Bangalore” → Approve
# open publicPath → submit form → Leads / Results
```

---

## Platform summary M1–M12 + Wave 1

| Area | Status |
|------|--------|
| Auth local | Verified |
| Auth Supabase signup/session | Partial (code on `main`; Redeploy + `SUPABASE_SERVICE_ROLE_KEY` required on Vercel) |
| CRM / marketing / workflows / RE (local SQLite) | Verified |
| Inbox send / ads / calendar OAuth / voice / payments | Blocked (creds) |
| AI deterministic qualify | Verified |
| AI assistant tools | Verified (local) |
| Worker queue | Verified (local) |
| Vercel `leadorbit-delta` | Partial — keep only project `leadorbit`; Redeploy `main` |
| Linkbook | **Out of scope** — untouched |

### Cross-cutting blockers

1. Domain stores not on Supabase → staging product data non-durable  
2. Provider credentials unset  
3. Agent egress blocks Vercel API / some competitor sites  
4. Dependency audit high advisories (transitive)

### Local runtime

- Web: http://127.0.0.1:43127  
- Worker: http://127.0.0.1:43128/health  
- SQLite: `.data/leadorbit.sqlite`

See also: `docs/product/FEATURE_SUPERIORITY_ROADMAP.md`, inventory handoff in agent store.
