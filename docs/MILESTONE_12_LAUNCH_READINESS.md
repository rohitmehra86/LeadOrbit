# Milestone 12 — Staging verification & operational readiness

## Delivered in-repo

- Env separation templates: `.env.development.example`, `.env.staging.example`, `.env.production.example`
- Deploy configs: `vercel.json`, `apps/worker/fly.toml`, `Dockerfile`, `railway.toml`
- Migration helper: `scripts/migrate.sh` · preflight: `scripts/deploy-check.sh`
- Observability package: `@leadorbit/observability` (structured logs, Sentry/OTEL/alert hooks)
- Health: web `0.12.0` + `?deep=1` queue/monitors; worker `/health` on 43128
- Queue monitoring API: `/api/v1/ops/queue` (platform admin)
- Docs: `DEPLOYMENT.md`, `OPERATIONS.md`, `BACKUP_DISASTER_RECOVERY.md`, `INCIDENT_RESPONSE.md`, `PRIVACY_DPDP.md`

## Not deployed (blocked)

Live Vercel / Supabase / Fly|Railway deploys were **not attempted** — no credentials in this environment.

## Go / no-go (staging)

| Gate | State |
|------|-------|
| Configs authored | Go |
| Local health web+worker | Go (when services running) |
| Automated tests M11 | Go (prior) |
| Staging Supabase linked | **No-go** — blocked |
| Staging Vercel deploy | **No-go** — blocked |
| Worker platform deploy | **No-go** — blocked |
| Backup restore drill evidence | **No-go** — not run |
| Commercial production readiness | **No-go** — insufficient evidence |
