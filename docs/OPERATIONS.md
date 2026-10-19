# LeadOrbit — Operations runbook

## Health checks

| Component | Endpoint | Notes |
|-----------|----------|-------|
| Web | `GET /api/v1/health` | Liveness |
| Web deep | `GET /api/v1/health?deep=1` | Queue counts + monitor status |
| Worker | `GET /health` on `WORKER_HEALTH_PORT` (43128) | Queue + monitors |
| Queue admin | `GET /api/v1/ops/queue` | Platform admin only |

Alert scaffolds: `QUEUE_DEAD_LETTER_ALERT`, `QUEUE_PENDING_ALERT`, `ALERT_WEBHOOK_URL`.

## Structured logging

`@leadorbit/observability` emits JSON lines: `level`, `msg`, `service`, `env`, `ts`, optional `orgId` / `requestId`.  
Ship stdout to your platform log drain (Vercel / Fly / Datadog).

## Error monitoring & OTEL

| Hook | Env | Status without credentials |
|------|-----|----------------------------|
| Sentry | `SENTRY_DSN` | `pending_configuration` |
| OpenTelemetry | `OTEL_EXPORTER_OTLP_ENDPOINT` | `pending_configuration` |
| Alerts | `ALERT_WEBHOOK_URL` | `pending_configuration` |

`captureException` always logs; does **not** claim Sentry delivery until SDK is initialized and verified.

## Common incidents

### Web 5xx spike

1. Check Vercel deployment + `/api/v1/health`
2. Confirm `SESSION_SECRET` / Supabase env present
3. Rollback web if bad release
4. Capture exception logs / Sentry

### Queue backlog / dead letters

1. `GET /api/v1/ops/queue` or worker `/health`
2. Inspect `durable_jobs` where `status='dead_letter'`
3. Fix root cause; re-enqueue only with idempotency awareness
4. Scale worker VM if `pending` grows under load

### Cross-tenant suspicion

1. Freeze related API keys / invites
2. Pull audit logs for org
3. Confirm RLS policies applied on Postgres (`./scripts/migrate.sh status`)
4. Escalate per incident response doc

### Payment webhook failures

1. Verify provider signature secrets
2. Check `billing_webhook_events` for duplicates / rejects
3. Never activate subscriptions from client-only success

## Cost monitoring notes

| Surface | Cost drivers | Guardrails |
|---------|--------------|------------|
| Vercel | Bandwidth, serverless invocations | Region pin; cache static |
| Supabase | DB size, egress, Auth MAU | Connection pooling; RLS; storage lifecycle |
| Worker VM | Always-on compute | `shared-cpu-1x` start; autoscale later |
| LLM | Tokens / tool calls | Plan AI credit quotas (M10) |
| Voice/SMS | Per-minute / per-segment | Legal flags + pending without creds |
| Stripe/Razorpay | Fees | Test mode in staging |

Review provider dashboards weekly in staging/prod; set billing alerts on Vercel/Supabase/LLM.

## Scaling assumptions

- **Single-region** web + worker initially (`iad`).
- SQLite job queue is **single-node**; move to Postgres/Redis queue before multi-worker.
- Postgres RLS is the tenancy boundary in supabase mode; local SQLite uses service-layer gates only.
- Rate limit map is in-memory per instance — use edge KV/Redis before multi-instance prod.

## External service limits (planning defaults)

Document actual quotas from each vendor dashboard after credentials exist. Placeholders:

- Stripe test: generous; live: standard API rate limits
- Supabase free/pro: connection + storage caps
- LLM: org AI credit quotas enforced in billing entitlements
