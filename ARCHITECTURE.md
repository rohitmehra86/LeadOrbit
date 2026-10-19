# LeadOrbit — Architecture

**Status:** Milestone 1 scaffolding  
**Stack:** Next.js App Router · TypeScript · Tailwind · Supabase (Postgres/Auth/Storage/RLS/pgvector) · Vercel · durable workers · GitHub Actions  

---

## 1. System context

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Browser /    │────▶│ apps/web        │────▶│ Supabase         │
│ Mobile Web   │     │ (Next.js)       │     │ Auth · Postgres  │
└──────────────┘     │ Route Handlers  │     │ Storage · Realtime│
                     │ Server Actions  │     │ pgvector         │
                     └────────┬────────┘     └────────▲─────────┘
                              │ enqueue               │
                              ▼                       │
                     ┌─────────────────┐              │
                     │ Queue / Jobs    │──────────────┘
                     │ (pg-boss / Redis│   workers mutate via
                     │  / equivalent)  │   service role + org checks
                     └────────┬────────┘
                              ▼
                     ┌─────────────────┐     ┌──────────────────┐
                     │ apps/worker     │────▶│ External APIs    │
                     │ durable process │     │ WhatsApp · ESP   │
                     └─────────────────┘     │ Stripe · Razorpay│
                                             │ Meta · Google    │
                                             │ LLM providers    │
                                             └──────────────────┘
```

**Hard rule:** Long-running, retryable, or provider-sensitive work (AI, campaigns, ad sync, payment reconciliation) runs in `apps/worker`, **not** inside Vercel request handlers beyond enqueue + ack.

---

## 2. Monorepo layout (domain-driven)

```
apps/
  web/                 # Next.js UI + BFF route handlers
  worker/              # Durable job consumers / schedulers
packages/
  domain/              # Pure domain types & invariants (no I/O)
  api-contracts/       # OpenAPI specs + generated/shared DTOs
  db/                  # Typed DB access helpers / repositories ports
  ui/                  # Shared UI primitives (shadcn-based)
  config/              # ESLint, TSConfig, Tailwind presets
  sdk/                 # Typed client for public/partner API (future)
supabase/
  migrations/          # SQL migrations + RLS
  seed/                # Dev seeds
  config.toml          # Local Supabase config (when CLI available)
docs/                  # Architecture, ADRs, migration notes
tests/
  e2e/                 # Playwright (later)
  contract/            # OpenAPI / pact-style checks
  unit/                # Shared unit tests
.github/workflows/     # CI
```

Package dependency direction (allowed):

```
apps/web → domain, api-contracts, db, ui, config
apps/worker → domain, api-contracts, db, config
db → domain, api-contracts
sdk → api-contracts
ui → config
```

No app imports another app. Domain has zero runtime I/O.

---

## 3. Bounded contexts

| Context | Owns | Primary packages |
|---------|------|------------------|
| Identity & Tenancy | Orgs, memberships, invites, API keys | `domain`, `db`, Auth |
| Lead Ops | Leads, contacts, companies, activities | `domain`, `db` |
| Pipeline | Pipelines, opportunities | `domain`, `db` |
| Conversations | Threads, messages, channel adapters | `domain`, worker adapters |
| Automation | Workflow defs, enrollments, jobs | `domain`, worker |
| AI Assist | Prompts, embeddings, suggestions | worker + pgvector |
| Billing | Plans, invoices, payments | `domain`, worker |
| Attribution | Touchpoints, reports | `domain`, `db` |
| Platform Admin | Tenant ops, feature flags | `apps/web` admin routes |

---

## 4. API strategy (Spring-ready)

- **Contract-first:** OpenAPI 3.1 under `packages/api-contracts/openapi/`.  
- **Versioning:** `/api/v1/...` on Next Route Handlers today.  
- **Ports & adapters:** Application use-cases in `packages/domain` (pure) + repository interfaces; Supabase implementations in `packages/db`.  
- **Future Java:** Re-implement adapters against the same OpenAPI; keep `apps/web` as BFF or static client. See `docs/MIGRATION_TO_JAVA.md`.  
- **Errors:** Problem+JSON (`application/problem+json`) shape standardized.  
- **Idempotency:** `Idempotency-Key` on lead ingest and payment intents.

---

## 5. Multi-tenancy & security

1. Every business table includes `org_id uuid not null`.  
2. RLS policies: `org_id in (select org_id from memberships where user_id = auth.uid())`.  
3. Workers use service role **only** after resolving job’s `org_id` and writing with explicit filters.  
4. Public capture endpoints use scoped tokens (form/public keys), not user JWTs.  
5. Secrets in env / Vercel / worker host — never in client bundles.  
6. Audit log for privileged actions (role change, export, API key create).

---

## 6. Data & AI

- **System of record:** Postgres (Supabase).  
- **Files:** Supabase Storage (org-prefixed paths + RLS).  
- **Vectors:** `pgvector` columns for lead summaries / knowledge chunks.  
- **Realtime (optional):** inbox updates via Supabase Realtime channels scoped by org.  
- **AI path:** enqueue → worker loads context (SQL + vector) → LLM → persist suggestion / optional auto-send under policy.

---

## 7. Worker & queue design

**Candidate backends (decide at Milestone 3 with credentials/hosting):**

| Option | Pros | Cons |
|--------|------|------|
| pg-boss (Postgres) | Few moving parts; fits Supabase | DB load |
| Redis + BullMQ | Fast, mature | Extra infra |
| Inngest / Trigger.dev | Managed durability | Vendor coupling |

Milestone 1 ships a **worker package skeleton** with a local in-process/dev queue adapter and a production interface (`JobQueue`). No claim of production durability until a backend is configured and verified.

Job types (initial catalog): `lead.score`, `workflow.run_step`, `message.send`, `embedding.upsert`, `payment.reconcile`, `ads.sync`.

---

## 8. Frontend architecture

- Next.js App Router with route groups: `(marketing)`, `(auth)`, `(app)`, `(admin)`.  
- Server Components for data reads; Client Components for interactive CRM surfaces.  
- shadcn/ui primitives in `packages/ui`.  
- Tenant context from session + membership; org switcher updates cookie/header.  
- Tailwind shared preset from `packages/config`.

---

## 9. Deployment topology

| Component | Target | Notes |
|-----------|--------|-------|
| `apps/web` | Vercel | Uncommon local port in dev (`43127`) |
| `apps/worker` | Container / VM / managed worker | Not Vercel serverless |
| DB / Auth / Storage | Supabase project | RLS always on |
| CI | GitHub Actions | lint, typecheck, unit, contract |

**Blocked until Rohit provides:** Vercel project, Supabase project, valid GitHub auth for private canonical repo, worker host.

---

## 10. Observability

- Structured JSON logs with `request_id`, `org_id`, `job_id`.  
- OpenTelemetry hooks prepared (env-driven exporter).  
- Health: `GET /api/v1/health` (web), worker `/healthz`.  
- Error tracking placeholder (Sentry) — not configured until DSN provided.

---

## 11. ADRs (lightweight index)

| ADR | Decision |
|-----|----------|
| ADR-001 | pnpm workspaces + Turborepo for monorepo orchestration |
| ADR-002 | Supabase as primary data/auth platform for v1 |
| ADR-003 | Durable workers mandatory for AI/automation |
| ADR-004 | OpenAPI contracts owned in `packages/api-contracts` |
| ADR-005 | No Spring migration in v1; ports ready |

Full ADR text lives in `docs/adr/` as milestones progress.

---

## 12. Threat model (abbreviated)

| Threat | Mitigation |
|--------|------------|
| Cross-tenant read | RLS + integration tests with two orgs |
| Service role leak | Server-only env; never `NEXT_PUBLIC_` |
| Webhook forgery | HMAC signatures per provider |
| Prompt injection via lead text | Sandboxed tools; no raw SQL from model |
| Cost runaway AI | Per-org quotas + queue rate limits |

---

## 13. Local development

```bash
pnpm install
pnpm dev:web      # http://127.0.0.1:43127
pnpm dev:worker  # worker process
pnpm lint && pnpm typecheck && pnpm test
```

Supabase local requires CLI + Docker (not yet available in this environment — documented in IMPLEMENTATION_STATUS).
