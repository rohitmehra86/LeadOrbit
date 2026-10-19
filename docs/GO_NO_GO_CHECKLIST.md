# Go / No-Go checklist

Mark only with evidence. Default is **No-Go**.

## Staging

| # | Gate | Evidence required | Status |
|---|------|-------------------|--------|
| S1 | Staging Supabase project linked + migrations applied | CLI output / dashboard | No-Go |
| S2 | Staging Vercel deploy serving `/api/v1/health` | Public URL + JSON | No-Go |
| S3 | Worker health on staging | `/health` JSON | No-Go |
| S4 | Auth signup/login against Supabase | Manual note | No-Go |
| S5 | Stripe/Razorpay test webhook idempotency | Dashboard + DB row | No-Go |
| S6 | Sentry or equivalent receiving a test error | Event ID | No-Go |
| S7 | Backup snapshot exists for staging DB | Screenshot / dump path | No-Go |

## Production

| # | Gate | Evidence required | Status |
|---|------|-------------------|--------|
| P1 | All staging gates Go | Checklist above | No-Go |
| P2 | `AUTH_MODE=supabase`, strong `SESSION_SECRET` | deploy-check pass | No-Go |
| P3 | Separate prod Supabase + Stripe live keys | Project IDs (not secrets) | No-Go |
| P4 | Rollback tested once | Vercel rollback note | No-Go |
| P5 | On-call + incident contacts filled | `INCIDENT_RESPONSE.md` | No-Go |
| P6 | Privacy policy live + counsel review | URL + date | No-Go |
| P7 | Load test / capacity note | Doc with numbers | No-Go |

**Commercially deployable production readiness:** No-Go until P1–P7 have evidence.
