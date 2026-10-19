# Backup & disaster recovery

**Not a verified live drill** in this environment — procedures are authored for when Supabase/Vercel credentials exist.

## What to back up

| Asset | Mechanism | RPO target (goal) | RTO target (goal) |
|-------|-----------|-------------------|-------------------|
| Postgres (Supabase) | Supabase daily backups + PITR on Pro | ≤ 24h (≤ 15m with PITR) | ≤ 4h |
| Auth users | Included in Supabase | same | same |
| Object storage (future) | Bucket versioning | ≤ 24h | ≤ 8h |
| Secrets | Vercel/Fly secret stores + offline sealed copy | n/a | ≤ 1h |
| Local SQLite (dev only) | File copy of `LEADORBIT_SQLITE_PATH` | best-effort | best-effort |

## Backup procedures

### Supabase Postgres

1. Dashboard → Database → Backups (confirm schedule)
2. Before risky migrations: `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%Y%m%d).dump`
3. Store dumps in encrypted object storage (not git)

### Local SQLite (development)

```bash
cp "$LEADORBIT_SQLITE_PATH" ".data/backup-$(date +%Y%m%d-%H%M%S).sqlite"
```

## Restore procedures

1. Announce incident / maintenance window
2. Stop workers (prevent writes)
3. Restore DB from dump or Supabase backup
4. Verify migration version / schema
5. Start worker, then web
6. Smoke: health, login, one org lead create
7. Postmortem

## Disaster scenarios

| Scenario | Response |
|----------|----------|
| Region outage (Vercel) | Fail over DNS to secondary deploy (requires preconfigured project) |
| DB corruption | Restore PITR / dump; replay webhook events from provider dashboards if needed |
| Secret leak | Rotate all keys (session, Supabase service role, Stripe/Razorpay webhooks, LLM); invalidate sessions |
| Ransomware / account compromise | Revoke tokens; restore from offline backup; see incident response |

## Drill cadence (recommended)

- Quarterly restore drill on **staging**
- Record evidence in `IMPLEMENTATION_STATUS.md` only after a real drill
