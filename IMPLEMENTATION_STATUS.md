# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 7 (AI agents, RAG, knowledge)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised here |
| **Blocked** | Needs credentials/tooling |
| **Not implemented** | Not started |

---

## Milestone 1–6

| Area | Status |
|------|--------|
| Foundation, auth/tenancy, CRM, marketing, ingestion, workflows, inbox | Implemented/verified |
| Live Supabase Auth / Postgres RLS / live messaging providers | **Blocked** (no credentials) |

---

## Milestone 7 — AI agents, RAG & knowledge

| Item | Status | Notes |
|------|--------|-------|
| AI agents (enquiry, extract, qualify, score, Q&A, recommend, next actions, appointment hooks, summaries, follow-up drafts, multilingual scaffold) | Implemented/verified | Deterministic core + optional LLM |
| AI config console (personas, knowledge, tools, channels, policies, handoff, usage/cost, evals, prompt versions) | Implemented/verified | `/app/orgs/:id/ai` |
| Never invent pricing/availability; auth for consequential tools; human escalation | Implemented/verified | Inventory SQL authoritative |
| Provider-agnostic OpenAI-compatible LLM gateway + structured outputs + tool auth | Implemented/verified | No keys → `pending_configuration` |
| Tenant-isolated KB upload/parse/chunk/embed/retrieve/version/reindex/delete | Implemented/verified | |
| Local vector fallback + honest status | Implemented/verified | `local_fallback` |
| pgvector migration authored | Implemented/verified (authored) | Not applied remotely |
| Retrieval quality tests | Implemented/verified | Unit + store |
| Structured inventory/prices in SQL | Implemented/verified | |
| Migration `00008_ai_knowledge.sql` | Implemented/verified (authored) | |
| Live LLM / embedding provider HTTP success | **Blocked** | No API keys; do not fake |
| Remote pgvector ANN | **Blocked** | |
| Draft PR | **Blocked** | `agent_temp` remote |

---

## Milestones 8–12

Not implemented. Not claimed.

---

## Blockers for Rohit

1. Supabase project (migrations 00002–00008) + optional pgvector  
2. `LLM_API_KEY` / `OPENAI_API_KEY` (and optional `LLM_BASE_URL`, `LLM_MODEL`)  
3. Messaging provider tokens (M6)  
4. Standard GitHub remote for PRs  
5. Vercel deploy token  

---

## Known issues

1. Auth tenancy still in-memory; domain data in SQLite — restart clears sessions.  
2. Web + worker must share `LEADORBIT_SQLITE_PATH` (defaults to repo-root `.data/leadorbit.sqlite`).  
3. Calling/voice is scaffolding only.  
4. PDF binary OCR not claimed — upload text extracts for indexing.  
5. LLM with keys present but unreachable is reported as `unverified`, not ready.
