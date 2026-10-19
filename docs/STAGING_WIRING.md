# LeadOrbit — Staging wiring runbook

**Honesty:** This document prepares wiring. It is **not** evidence that staging is live. Do not mark deploys Verified without HTTP/CLI proof.

## Dependency order

1. **GitHub** — private repo or push URL Rohit provides  
2. **Supabase** — confirm staging project ref → link → apply migrations  
3. **Vercel** — link/create project → set env vars → deploy web  
4. **Worker** — Fly **or** Railway → secrets → deploy → `/health`  
5. Update `IMPLEMENTATION_STATUS.md` with evidence only  

Orchestrator: `bash scripts/staging/wire-all.sh`

Probe only (no side effects): `bash scripts/staging/00-check-auth.sh`

## What Rohit should provide

Prefer a secure channel (password manager / vault). **Do not paste live secrets into chat** if avoidable; env vars / token files in the agent VM are fine.

| Item | Env / input | Notes |
|------|-------------|-------|
| GitHub | `GH_TOKEN` / `GITHUB_TOKEN` **or** `LEADORBIT_GITHUB_REPO_URL` | PAT accepted for **git** on `github.com`. `gh`/`repo create` needs `api.github.com` (currently egress-blocked). Prefer: create empty private repo in UI → give `https://github.com/<owner>/<repo>.git` |
| Supabase staging ref | `LEADORBIT_STAGING_SUPABASE_PROJECT_REF` | **Must confirm** — MCP can see org projects but must not assume which is staging |
| Supabase CLI token | `SUPABASE_ACCESS_TOKEN` | Needed for CLI link/`db push`; MCP can apply if approved |
| DB URL (optional alt) | `DATABASE_URL` | Staging Postgres only |
| Staging env file | `.env.staging.local` | Copy `.env.staging.example`; never commit |
| Vercel | `VERCEL_TOKEN` (+ optional `LEADORBIT_VERCEL_SCOPE`) | Or interactive `vercel login` |
| Worker host | `LEADORBIT_WORKER_HOST=fly\|railway` | Plus `FLY_API_TOKEN` or Railway login/token |

### Supabase projects visible via MCP (not assumed staging)

Org `paxaris` currently lists:

- `kqmuxocbmtydkxdvmypy` — “rohitmehra86's Project” (`ap-northeast-1`)
- `ipxflpzfcqwtenodbxwc` — “linkbook” (`ap-southeast-1`)

**Do not migrate until Rohit names the staging project** (or asks to create a new one).

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/staging/00-check-auth.sh` | Auth readiness; no secrets printed |
| `scripts/staging/01-github-remote.sh` | Create private repo or push to URL |
| `scripts/staging/02-supabase-link-migrate.sh` | Link + migrate (apply gated) |
| `scripts/staging/03-vercel-link-env.sh` | Link project + upload env + optional deploy |
| `scripts/staging/04-worker-deploy.sh` | Fly or Railway deploy |
| `scripts/staging/wire-all.sh` | Runs 1→4 then stamps status doc |

### Useful overrides

```bash
export LEADORBIT_SKIP_GITHUB=0
export LEADORBIT_SKIP_SUPABASE=0
export LEADORBIT_SKIP_VERCEL=0
export LEADORBIT_SKIP_WORKER=0
export LEADORBIT_STAGING_MIGRATE_APPLY=1   # required for real migrate in step 02
export LEADORBIT_VERCEL_DEPLOY=1           # deploy after env upload
export LEADORBIT_WORKER_HOST=fly           # or railway
```

## Local runtime (always keep up during prep)

- Web: [http://127.0.0.1:43127](http://127.0.0.1:43127) — health `/api/v1/health`  
- Worker: [http://127.0.0.1:43128/health](http://127.0.0.1:43128/health)

## GitHub default branch

Repo https://github.com/rohitmehra86/LeadOrbit uses **`main`** (M12 code). Agent tracks `github/main`.

## Connect Vercel + Supabase (what Rohit does)

### A) Network allowlist (must approve in Cursor environment)

Without these, tokens cannot be used from this agent:

1. `vercel.com`
2. `api.vercel.com`
3. `api.supabase.com`
4. `*.supabase.co` (DB / migrations)

### B) Send these in chat or secrets UI

1. **Vercel** — create token: https://vercel.com/account/tokens → paste as `VERCEL_TOKEN`  
   Optional: team slug → `LEADORBIT_VERCEL_SCOPE`
2. **Supabase staging project** — reply with one:
   - `kqmuxocbmtydkxdvmypy` (rohitmehra86's Project)
   - `ipxflpzfcqwtenodbxwc` (linkbook)
   - or “create new `leadorbit-staging`”
3. Optional CLI token: https://supabase.com/dashboard/account/tokens → `SUPABASE_ACCESS_TOKEN`  
   (MCP is already authenticated; CLI token helps `supabase link` / `db push`)

### C) Staging env values (for Vercel)

Copy `.env.staging.example` → fill (do not commit):

- `SESSION_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_MODE=supabase`
- `NEXT_PUBLIC_APP_URL` (Vercel URL once known)

Agent can pull publishable keys via Supabase MCP after you confirm the project.

## When credentials arrive

```bash
# After exporting tokens / writing .env.staging.local (not committed):
export LEADORBIT_SKIP_GITHUB=1   # already on github.com/rohitmehra86/LeadOrbit main
bash scripts/staging/wire-all.sh
```

Then verify with evidence (status codes / URLs / `vercel ls` / MCP `list_migrations`) before marking Verified.
