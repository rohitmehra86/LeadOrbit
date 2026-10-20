# LeadOrbit — Vercel env setup (UI)

Agent cannot call Vercel API from this environment (egress). Set these in **Vercel → Project `leadorbit` only → Settings → Environment Variables** for **Production** and **Preview**.

## Required project settings first

1. **Root Directory** = `apps/web` (not `./`)
2. Use only project **`leadorbit`** (`leadorbit-delta.vercel.app`) — see [`VERCEL_PROJECTS.md`](./VERCEL_PROJECTS.md)
3. Redeploy after saving Root Directory + env vars

## Environment variables

| Name | Value |
|------|--------|
| `AUTH_MODE` | `supabase` |
| `LEADORBIT_ENV` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kqmuxocbmtydkxdvmypy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project **LeadOrbit** (`kqmuxocbmtydkxdvmypy`) → Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required for staging signup** — same page → `service_role` (server only, never `NEXT_PUBLIC_`) |
| `SESSION_SECRET` | `openssl rand -base64 48` (kept for local JWT tooling; Supabase Auth uses its own cookies) |
| `NEXT_PUBLIC_APP_URL` | `https://leadorbit-delta.vercel.app` |
| `CSRF_STRICT` | `1` |
| `CSRF_ALLOWED_ORIGINS` | `https://leadorbit-delta.vercel.app` |

Do **not** paste Linkbook project keys.

## Why signup failed before

With Supabase URL/anon set, the app runs `AUTH_MODE=supabase`, but signup/login APIs returned **501 Not Implemented**. That path is now implemented (Supabase Auth + Postgres tenancy). Redeploy `main` after this fix, ensure **`SUPABASE_SERVICE_ROLE_KEY`** is set, then retry `/signup`.

## After env is set

Deployments → **Redeploy** latest `main`. Open `https://leadorbit-delta.vercel.app/signup`.
