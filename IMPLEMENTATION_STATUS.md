# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 6 (Workflow automation & unified inbox)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised here |
| **Blocked** | Needs credentials/tooling |
| **Not implemented** | Not started |

---

## Milestone 1–5

| Area | Status |
|------|--------|
| Foundation, auth/tenancy, CRM, marketing, ingestion/attribution | Implemented/verified |
| Live Supabase Auth / Postgres RLS | **Blocked** (no credentials) |

---

## Milestone 6 — Workflows & unified communications

| Item | Status | Notes |
|------|--------|-------|
| Visual workflow builder (triggers + actions) | Implemented/verified | `/app/orgs/:id/workflows` |
| Draft/publish, versioning, test mode | Implemented/verified | |
| Enrollment pause/resume/cancel + execution history | Implemented/verified | |
| Retry / dead-letter / idempotency | Implemented/verified | Unit + store tests |
| Audit logs | Implemented/verified | |
| Durable execution via `apps/worker` + SQLite job queue | Implemented/verified | Not in request handlers |
| Unified inbox (multi-channel model) | Implemented/verified | `/app/orgs/:id/inbox` |
| History, assignment, unread, notes, tags, search, templates, SLA, opt-out, schedule | Implemented/verified | |
| Provider adapters + signed messaging webhooks | Implemented/verified | |
| Outbound without credentials | Implemented/verified | `pending_configuration` — not faked |
| Migration `00007_workflows_inbox.sql` | Implemented/verified (authored) | Not applied remotely |
| Live provider delivery (WhatsApp/Email/SMS/Meta) | **Blocked** | No credentials; stubs only |
| Postgres RLS | **Blocked** | |
| Draft PR | **Blocked** | `agent_temp` remote |

---

## Milestones 7–12

Not implemented. Not claimed.

---

## Blockers for Rohit

1. Supabase project (migrations 00002–00007)  
2. Messaging provider tokens (`WHATSAPP_TOKEN`, `SMTP_URL`/`RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `META_MESSAGING_TOKEN`)  
3. Standard GitHub remote for PRs  
4. Vercel deploy token  

---

## Known issues

1. Auth tenancy still in-memory; domain data in SQLite — restart clears sessions.  
2. Web + worker must share `LEADORBIT_SQLITE_PATH` (defaults to repo-root `.data/leadorbit.sqlite`).  
3. Calling/voice is scaffolding only.  
4. Workflow webhook action records intent only (no live outbound HTTP claimed).
