# Milestone 2 — Auth & multi-tenancy

## Modes

| Mode | When | Behavior |
|------|------|----------|
| `local` | Default if Supabase env missing, or `AUTH_MODE=local` | Cookie JWT session + in-process `LocalTenancyStore` with permission checks |
| `supabase` | `AUTH_MODE=supabase` or URL+anon key set | `@supabase/ssr` session refresh in middleware; tenancy repos **not fully wired** until migrations applied on a live project |

## Env

See `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never `NEXT_PUBLIC_`)
- `DEV_SESSION_SECRET` (local JWT signing)
- `AUTH_MODE=local|supabase`

## RLS

Migrations:

- `supabase/migrations/00002_tenancy.sql`
- `supabase/migrations/00003_flags_entitlements_audit.sql`

**Postgres RLS has not been executed against a live DB in this environment** (no Docker, no Supabase credentials, MCP auth timed out). Service-layer cross-tenant denial is verified via unit tests.

## Roles → permissions

Implemented in `@leadorbit/domain` (`permissions.ts`): Owner, Admin, Manager, Agent, Viewer with fine-grained keys (`members:invite`, `settings:write`, `audit:read`, etc.).

## Super-admin

`platform_admins` table + `/platform` UI. Local mode: first signup bootstraps platform admin for skeleton testing.
