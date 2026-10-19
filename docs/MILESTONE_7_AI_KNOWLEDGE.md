# Milestone 7 — AI sales agents, RAG, knowledge

## Principles

- Deterministic qualification always runs (budget/location/timeline/score).
- LLM gateway is OpenAI-compatible; without keys → `pending_configuration` (not faked ready).
- Never invent pricing/availability/commitments; SQL `inventory_items` is authoritative.
- Consequential tools (`update_lead_fields`, `send_authorized_message`, `propose_appointment`) require auth and human confirmation.
- Knowledge retrieval is tenant-scoped (`org_id` in SQL). No cross-tenant hits.
- Vector backend: `local_fallback` hashing embeddings locally; `pgvector` when `DATABASE_URL` + `PGVECTOR_ENABLED=true`.

## Surfaces

| Path | Role |
|------|------|
| `/app/orgs/:id/ai` | AI config console + KB + inventory + run turns |
| `POST /api/v1/orgs/:id/ai/run` | Qualification / Q&A turn |
| `*/ai/personas`, `*/ai/usage`, `*/ai/evals`, `*/ai/turns` | Config, cost, evals |
| `*/knowledge/documents`, `retrieve`, `inventory`, `quality` | RAG + catalog |

## Durable work

`apps/worker` handles `knowledge.reindex` and `embedding.upsert`. AI turns run in the BFF for latency and enqueue `ai.run_turn` ack jobs.

## Verified

- Unit: deterministic qualify, grounded reply, LLM pending without keys, local embed similarity, retrieval quality
- Store: cross-tenant KB forbidden, index/retrieve/delete, AI turn + usage without keys
- Not verified: live OpenAI HTTP success, remote pgvector
