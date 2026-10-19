# LeadOrbit — Deployment guide

**Honesty:** Configs in this repo are ready. Live staging/production deploys are **blocked** until Rohit provides Vercel, Supabase, and worker platform credentials. Do not treat scaffold files as evidence of a live deploy.

## Environment separation

| Env | Auth | Data | Config template |
|-----|------|------|-----------------|
| development | `AUTH_MODE=local` | SQLite `.data/` | `.env.development.example` |
| staging | `AUTH_MODE=supabase` | Supabase staging project | `.env.staging.example` |
| production | `AUTH_MODE=supabase` | Supabase production project | `.env.production.example` |

Never share Supabase projects or Stripe live keys across staging and production.

## Target architecture

```
Browser → Vercel (Next.js apps/web)
                ↓
         Supabase Auth + Postgres (RLS)
                ↓
         Worker (Fly.io / Railway) — durable jobs
```

Vercel **must not** run the long-lived worker. Use `apps/worker/fly.toml` or `railway.toml`.

## Safe deploy procedure (when credentials exist)

1. `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:security`
2. `./scripts/deploy-check.sh` (must pass for staging/prod)
3. Migrations: `./scripts/migrate.sh apply` against the target DB (backup first)
4. Deploy worker first (so queue consumers exist), then web
5. Smoke: `GET /api/v1/health?deep=1`, worker `GET /health`, signup/login, create org
6. Record version + git SHA in the release notes

### Vercel (web)

```bash
# Requires: vercel login / VERCEL_TOKEN
pnpm dlx vercel link --yes
pnpm dlx vercel env pull   # verify vars — do not print secrets
pnpm dlx vercel --prod     # only after staging soak
```

**Required Vercel project setting (monorepo):**

1. Project **leadorbit** → Settings → General → **Root Directory** = `apps/web` (not `./`)
2. Framework: Next.js (from `apps/web/vercel.json`)
3. Install/build come from `apps/web/vercel.json` (`pnpm` at repo root, then `next build` in `apps/web` so `.next` lands where Vercel expects)

Root Directory `./` causes `NEXT_OUTPUT_DIR_MISSING` because Next writes `apps/web/.next`, not `/.next`.

Do not attach LeadOrbit to LinkBooks Vercel projects.

### Supabase

```bash
npx supabase login
npx supabase link --project-ref <ref>
./scripts/migrate.sh apply
```

### Worker (Fly)

```bash
fly auth login
fly apps create leadorbit-worker
fly secrets set SESSION_SECRET=... LEADORBIT_SQLITE_PATH=... # etc
fly deploy -c apps/worker/fly.toml
```

## Rollback

1. **Web:** Vercel → Promote previous deployment (instant). Or `vercel rollback`.
2. **Worker:** `fly releases` → `fly deploy --image <previous>` / Railway rollback.
3. **Migrations:** Prefer forward-fix. If a migration must reverse, apply a new numbered migration — do not edit applied files. Keep DB backup from pre-deploy.
4. **Feature flags:** Disable risky flags via org flags / plan entitlements before hard rollback when possible.

## Staging wiring scripts

See **[STAGING_WIRING.md](./STAGING_WIRING.md)** and `scripts/staging/`:

```bash
bash scripts/staging/00-check-auth.sh   # probe only
bash scripts/staging/wire-all.sh        # when Rohit credentials are in env
```

## Current status (this agent environment)

| Target | Status |
|--------|--------|
| Vercel deploy | **Blocked** — no `VERCEL_TOKEN` / project |
| Supabase link + migrate | **Blocked** for CLI; MCP authenticated but staging project **unconfirmed** |
| Fly/Railway worker deploy | **Blocked** — Fly missing; Railway unauthorized |
| GitHub (`gh`) private repo | **Blocked** — `GH_TOKEN` invalid |
| Local web + worker | **Verified** — ports 43127 / 43128 |
| Staging wire scripts/docs | **Scaffolded** — ready when credentials arrive |
