# Milestone 11 — End-to-end testing, security hardening, performance

## What shipped

### Automated coverage

| Area | Suite |
|------|--------|
| Auth, roles, tenant isolation | `tests/integration/m11-coverage.test.ts` + existing store tests |
| Leads / duplicates / CRM transitions | integration + `crm-store.test.ts` |
| Campaign attribution / form publish | integration |
| Workflows + retry/dead-letter | integration + `job-queue.test.ts` |
| Appointment conflicts | integration + `calendar-store.test.ts` |
| AI structured output validation | `packages/domain/src/security.ts` + integration |
| Webhook security + billing idempotency + entitlements | integration + `billing-store.test.ts` |
| RLS migration review | `tests/security/rls-review.test.ts` |
| API contract | `tests/contract/api-health.test.ts` |
| Perf smoke | `tests/perf/smoke.test.ts` |
| Browser e2e + a11y | Playwright `tests/e2e/auth-and-org.spec.ts` |

### Security hardening

- Rate limiting + security headers + CSRF origin review in `apps/web/src/middleware.ts`
- Session secret production guard; health exposes `sessionSecretConfigured`
- Signup input validation (`isValidEmail`, password length, sanitize name)
- Privacy export / delete-request scaffolding
- `docs/SECURITY.md` secret handling
- CI: `pnpm audit --audit-level=high`, integration/security/perf jobs, Playwright

### Performance

- Smoke latency budgets for `/api/v1/health` and `/login` (default 5s). Not a load test.

## Commands

```bash
pnpm test                 # package tests + contract
pnpm test:integration     # M11 integration suite
pnpm test:security        # RLS review + HTTP guards
pnpm test:perf            # smoke (needs server)
pnpm test:e2e             # Playwright (needs server or CI webServer)
```

## Honesty

- Live Postgres RLS execution: **blocked** (no Supabase project).
- CSP is **report-only**, not enforced.
- Rate limit is in-memory (not multi-instance safe).
- Privacy purge is scaffolded, not automated.
- `pnpm audit --audit-level=high` currently **fails** on transitive Next/eslint advisories (recorded in `IMPLEMENTATION_STATUS.md`).
- Playwright browser CDN download was blocked in one environment; e2e verified with `PLAYWRIGHT_CHANNEL=chrome`.
- Do **not** claim production readiness or Milestone 12 complete from this milestone alone.
