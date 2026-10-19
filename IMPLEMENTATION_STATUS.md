# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 5 (Lead ingestion, integrations, attribution)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised here |
| **Blocked** | Needs credentials/tooling |
| **Not implemented** | Not started |

---

## Milestone 1–4

| Area | Status |
|------|--------|
| Foundation, local auth/tenancy, CRM, marketing builders | Implemented/verified |
| Live Supabase Auth / Postgres RLS | **Blocked** (no credentials) |

---

## Milestone 5 — Lead ingestion, integrations & attribution

| Item | Status | Notes |
|------|--------|-------|
| Unified ingestion pipeline (form, landing, webhook, public capture) | Implemented/verified | `IngestionStore.ingestLead` |
| Signed webhooks (HMAC + timestamp skew) | Implemented/verified | Unit + store tests |
| Idempotency at ingestion boundary | Implemented/verified | Channel-namespaced keys |
| Duplicate fingerprint handling | Implemented/verified | |
| Delivery-status sync scaffolding (retry/dead_letter) | Implemented/verified | Outbound not live-sent |
| Attribution UTM → campaign → lead → opportunity | Implemented/verified | first/last/linear |
| Ingestion audit events (tenant-scoped) | Implemented/verified | `/integrations` UI |
| Meta/Google lead ads authorize + pull stubs | Implemented/verified | `pending_configuration` / imported=0 — not faked |
| SQLite tables + migration `00006` | Implemented/verified (authored) | Remote not applied |
| Cross-tenant ingestion denial | Implemented/verified | |
| Postgres RLS ingestion isolation | **Blocked** | No Supabase project |
| Live Ads API lead import / live outbound HTTP | **Blocked** | Not faked |
| Draft PR | **Blocked** | `agent_temp` remote |

---

## Milestones 6–12

Not implemented. Not claimed.

---

## Blockers for Rohit

1. Supabase project (apply migrations 00002–00006; verify RLS)  
2. Optional: `META_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN` for authorize-stub ≠ pending  
3. GitHub auth / standard repo for PRs  
4. Vercel deploy token  

---

## Known issues

1. Auth tenancy store is still in-memory; CRM/marketing/ingestion are SQLite — restart clears sessions.  
2. Outbound webhook delivery is scaffolded (status machine only; no live HTTP claimed).  
3. Lead ads pull never invents leads even if authorize stub is ready.
