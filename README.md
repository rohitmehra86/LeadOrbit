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
- Members, invites, flags, audit, `GET /api/v1/platform/orgs`  
- Billing + webhooks: `/api/v1/orgs/:id/billing`, `/api/v1/billing/webhooks/{stripe,razorpay}`, platform billing  
- Analytics + CSV: `/api/v1/orgs/:id/analytics`, `/export`  
- White-label: `/api/v1/orgs/:id/white-label`, public `/api/v1/public/branding/:orgId`  

UI: `/signup`, `/login`, `/app`, `/app/orgs/:id`, CRM, Marketing, Integrations, Workflows, Inbox, AI & knowledge, Calendar & voice, Real estate (optional), Analytics, Billing, White label, `/platform`

Domain data persists to shared SQLite at repo-root `.data/leadorbit.sqlite` (override `LEADORBIT_SQLITE_PATH`).  
Docs: [`MILESTONE_11_HARDENING`](./docs/MILESTONE_11_HARDENING.md) · [`MILESTONE_12_LAUNCH_READINESS`](./docs/MILESTONE_12_LAUNCH_READINESS.md) · [`DEPLOYMENT`](./docs/DEPLOYMENT.md) · [`OPERATIONS`](./docs/OPERATIONS.md) · [`SECURITY`](./docs/SECURITY.md) · [`PRIVACY_DPDP`](./docs/PRIVACY_DPDP.md) · earlier milestone docs under `docs/`.

```bash
pnpm test:m11           # unit/contract + integration + security + perf smoke
pnpm test:e2e           # Playwright (PLAYWRIGHT_CHANNEL=chrome if CDN blocked)
pnpm audit:deps         # high+ advisories (may fail on transitive Next deps)
pnpm deploy:check       # preflight (fails closed without staging/prod secrets)
pnpm migrate:status     # list SQL migrations
```

**Deploy status:** Vercel / Supabase / worker configs are in-repo; live deploys are **blocked** without credentials — see `IMPLEMENTATION_STATUS.md`.

```bash
pnpm dev:web     # http://127.0.0.1:43127
pnpm dev:worker  # durable workflow/message consumer
```

Public landing pages: `/p/:orgId/:slug`.  
Signed lead webhooks: `POST /api/v1/public/webhooks/:orgId/:endpointId`.  
Signed messaging webhooks: `POST /api/v1/public/messaging/:orgId/:channel`.

## License

Proprietary — all rights reserved.

