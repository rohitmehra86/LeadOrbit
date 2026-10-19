# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 3 (CRM)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised here |
| **Blocked** | Needs credentials/tooling |
| **Not implemented** | Not started |

---

## Milestone 1–2

| Area | Status |
|------|--------|
| Foundation monorepo + docs | Implemented/verified |
| Local auth, orgs, invites, permissions, platform admin skeleton | Implemented/verified |
| Live Supabase Auth / Postgres RLS | **Blocked** (no credentials) |

---

## Milestone 3 — CRM

| Item | Status | Notes |
|------|--------|-------|
| Domain CRM model + assignment strategies | Implemented/verified | Unit tests |
| SQLite persistence (`node:sqlite`) | Implemented/verified | `.data/leadorbit.sqlite` |
| Supabase CRM migration `00004_crm_core.sql` | Implemented/verified (authored) | Not applied to remote DB |
| Leads/contacts/companies/opportunities | Implemented/verified | APIs + SQLite |
| Pipelines/stages, Kanban + table UI | Implemented/verified | `/app/orgs/:id/crm` |
| Tasks, notes, activity timeline | Implemented/verified | |
| Attachments metadata, tags, custom fields, saved views, segments | Implemented/verified | Scaffolding APIs |
| Import/export CSV + public capture idempotency | Implemented/verified | HTTP smoke: same Idempotency-Key → same id |
| Duplicate detection + merge | Implemented/verified | Unit test |
| Assignment strategies + ownership history | Implemented/verified | Unit + store tests |
| SLA timers + escalation | Implemented/verified | API `/sla/escalate` |
| Follow-up reminders | Implemented/verified | |
| Cross-tenant CRM denial | Implemented/verified | HTTP 403 on leads list |
| `pnpm typecheck` / `lint` / `test` | Implemented/verified | Pass |
| Postgres RLS CRM isolation | **Blocked** | No Supabase project |
| Draft PR | **Blocked** | `agent_temp` remote |

---

## Milestones 4–12

Not implemented (M4 pipeline UI overlap intentionally folded into M3 Kanban; remaining M4+ items not claimed).

---

## Blockers for Rohit

1. Supabase project (apply migrations 00002–00004; verify RLS)  
2. GitHub auth / standard repo for PRs  
3. Vercel deploy token  

---

## Known issues

1. Auth tenancy store is still in-memory; CRM is SQLite — after process restart, re-create orgs/sessions; CRM rows may orphan until org ids rematch.  
2. Attachment storage is metadata-only (local path string).  
3. CSV import runs in-request (not durable worker).
