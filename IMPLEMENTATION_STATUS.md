# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 4 (Campaigns, forms, landing pages)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised here |
| **Blocked** | Needs credentials/tooling |
| **Not implemented** | Not started |

---

## Milestone 1–3

| Area | Status |
|------|--------|
| Foundation monorepo + docs | Implemented/verified |
| Local auth, orgs, invites, permissions, platform admin skeleton | Implemented/verified |
| CRM (leads, pipelines, Kanban, assignment, SLA, merge, import) | Implemented/verified |
| Live Supabase Auth / Postgres RLS | **Blocked** (no credentials) |

---

## Milestone 4 — Campaigns, forms, landing pages & funnels

| Item | Status | Notes |
|------|--------|-------|
| Domain model + UTM + safe page sanitize | Implemented/verified | Unit tests |
| SQLite persistence (shared DB file) | Implemented/verified | Tables in `sqlite.ts` |
| Supabase migration `00005_marketing_campaigns.sql` | Implemented/verified (authored) | Not applied remotely |
| Campaign CRUD, budget, schedule, status, A/B scaffold, duplicate, templates | Implemented/verified | `/app/orgs/:id/marketing` |
| Creative asset library scaffolding | Implemented/verified | Metadata paths only |
| AI suggestion hooks | Implemented/verified | `unverified` without `LLM_API_KEY` |
| Meta/Google Ads adapters | Implemented/verified | `pending_configuration` without creds |
| Performance from persisted events | Implemented/verified | page_view / form_submit / conversion |
| Form builder (drag, multi-step, CRM map, honeypot, duplicates, embed, versions) | Implemented/verified | `/marketing/forms` |
| Landing page builder (blocks, SEO, publish, versions, mobile preview, RE template) | Implemented/verified | `/marketing/pages` |
| Funnels scaffolding | Implemented/verified | |
| Public page + form submit → tenant + CRM lead | Implemented/verified | `/p/:orgId/:slug` |
| Cross-tenant marketing denial | Implemented/verified | Unit + HTTP |
| Postgres RLS marketing isolation | **Blocked** | No Supabase project |
| Live ad network sync / live LLM | **Blocked** | No credentials — not faked |
| Draft PR | **Blocked** | `agent_temp` remote |

---

## Milestones 5–12

Not implemented. Not claimed.

---

## Blockers for Rohit

1. Supabase project (apply migrations 00002–00005; verify RLS)  
2. Optional: `LLM_API_KEY`, `META_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`  
3. GitHub auth / standard repo for PRs  
4. Vercel deploy token  

---

## Known issues

1. Auth tenancy store is still in-memory; CRM/marketing are SQLite — after process restart, re-create orgs/sessions.  
2. Creative/attachment storage is metadata-only.  
3. Form webhooks are scaffolding (URL stored; delivery not claimed).  
4. IMPLEMENTATION_PLAN.md still lists an older “M4 pipelines” label; product M4 delivered here is marketing assets (pipelines shipped in M3).
