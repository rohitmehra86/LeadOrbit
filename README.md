# LeadOrbit (`ai-lead-revenue-cloud`)

Multi-tenant **AI Lead & Revenue Cloud** SaaS — production-grade target architecture (not an MVP mock).

Stack: Next.js App Router · TypeScript · Tailwind · Supabase · Vercel · durable workers · GitHub Actions.

## Docs

| Document | Path |
|----------|------|
| Product requirements | [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) |
| Competitor feature matrix | [`COMPETITOR_FEATURE_MATRIX.md`](./COMPETITOR_FEATURE_MATRIX.md) |
| Architecture | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Database design | [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) |
| Implementation plan | [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) |
| Implementation status (honest) | [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) |
| Java migration starter | [`docs/MIGRATION_TO_JAVA.md`](./docs/MIGRATION_TO_JAVA.md) |
| Package boundaries | [`docs/PACKAGE_BOUNDARIES.md`](./docs/PACKAGE_BOUNDARIES.md) |
| OpenAPI stub | [`packages/api-contracts/openapi/openapi.yaml`](./packages/api-contracts/openapi/openapi.yaml) |

## Monorepo

```
apps/web          Next.js UI + /api/v1 BFF
apps/worker       Durable job consumer skeleton
packages/domain   Pure domain types & invariants
packages/api-contracts  OpenAPI + DTOs
packages/db       Repository ports (Supabase later)
packages/ui       Shared UI primitives
packages/config   Shared TS config
supabase/         Migrations + config stubs
tests/            e2e / contract / unit (growing)
```

## Local development

Prerequisites: Node 22+, pnpm 10+.

```bash
pnpm install
pnpm dev:web      # http://127.0.0.1:43127
pnpm dev:worker  # durable SQLite job consumer (share LEADORBIT_SQLITE_PATH)
pnpm lint
pnpm typecheck
pnpm test
```

Supabase CLI, Docker, Vercel CLI, and provider credentials are **not** assumed. See `IMPLEMENTATION_STATUS.md` for blockers.

## Auth (Milestone 2)

Default **`AUTH_MODE=local`** when Supabase env is unset: cookie session + in-process tenancy store (permission-checked).  
Set Supabase URL/anon key (and apply `supabase/migrations`) for production Auth + RLS. Details: [`docs/MILESTONE_2_AUTH.md`](./docs/MILESTONE_2_AUTH.md).

## API (current)

- `GET /api/v1/health` → status + `authMode`  
- `POST /api/v1/auth/signup|login|logout`, `GET /api/v1/auth/session`  
- `GET|POST /api/v1/orgs`, `GET|PATCH /api/v1/orgs/:id`  
- Members, invites, flags, billing stubs, audit, `GET /api/v1/platform/orgs`  

UI: `/signup`, `/login`, `/app`, `/app/orgs/:id`, CRM, Marketing, Integrations, Workflows, Inbox, AI & knowledge, Calendar & voice, Real estate (optional), `/platform`

Domain data persists to shared SQLite at repo-root `.data/leadorbit.sqlite` (override `LEADORBIT_SQLITE_PATH`).  
Docs: [`MILESTONE_3_CRM`](./docs/MILESTONE_3_CRM.md) · [`MILESTONE_4_MARKETING`](./docs/MILESTONE_4_MARKETING.md) · [`MILESTONE_5_INGESTION`](./docs/MILESTONE_5_INGESTION.md) · [`MILESTONE_6_AUTOMATION`](./docs/MILESTONE_6_AUTOMATION.md) · [`MILESTONE_7_AI_KNOWLEDGE`](./docs/MILESTONE_7_AI_KNOWLEDGE.md) · [`MILESTONE_8_CALENDAR_VOICE`](./docs/MILESTONE_8_CALENDAR_VOICE.md) · [`MILESTONE_9_REAL_ESTATE`](./docs/MILESTONE_9_REAL_ESTATE.md).

```bash
pnpm dev:web     # http://127.0.0.1:43127
pnpm dev:worker  # durable workflow/message consumer
```

Public landing pages: `/p/:orgId/:slug`.  
Signed lead webhooks: `POST /api/v1/public/webhooks/:orgId/:endpointId`.  
Signed messaging webhooks: `POST /api/v1/public/messaging/:orgId/:channel`.

## License

Proprietary — all rights reserved.

