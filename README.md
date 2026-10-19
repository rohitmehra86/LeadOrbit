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
pnpm dev:worker  # in-memory queue (not production durable)
pnpm lint
pnpm typecheck
pnpm test
```

Supabase CLI, Docker, Vercel CLI, and provider credentials are **not** assumed. See `IMPLEMENTATION_STATUS.md` for blockers.

## API (Milestone 1)

- `GET /api/v1/health` → `{ status: "ok", ... }`  
- `GET|POST /api/v1/orgs` → `501` until Milestone 2 auth  

## License

Proprietary — all rights reserved.
