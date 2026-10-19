# Milestone 10 — Analytics, billing, white labeling

## Analytics

- Dashboard aggregates **real persisted** SQLite/CRM tables plus `analytics_events`.
- Each metric reports `availability`: `ok` | `zero` | `unavailable` (missing source ≠ zero).
- Covered: leads by channel/campaign, CPL/CPQL, funnels, pipeline, revenue attribution, ROI, response time, agent productivity, appointment conversion, lost reasons, AI performance, communication costs, SaaS revenue, tenant usage, operational failures.
- CSV export, date range + comparison period, scheduled report scaffolding (`report.schedule` job).

## Billing

- Plans: trial / starter / growth (monthly + annual), seats + AI credits + usage quotas + feature map.
- Checkout without Stripe/Razorpay credentials → `pending_configuration` (no fake success).
- **Never** store raw cards. **Never** activate from client-only success.
- Stripe + Razorpay webhook adapters with HMAC verification and **idempotent** `(provider, event_id)`.
- Failed payment → `past_due` + grace; cancel at period end; super-admin `POST /api/v1/platform/billing`.
- Entitlement gates: `requireFeature` / `assertEntitled`.

## White label

- Logo, colors, login headline, email from/footer, hide LeadOrbit mark.
- Custom domain TXT verification **scaffolded** (no live DNS).
- Public branding: `GET /api/v1/public/branding/:orgId`.
- Feature visibility from subscription; agency child-org linking scaffolding.
- Writes require `white_label` plan feature (Growth+).

## Surfaces

| Surface | Path |
|---------|------|
| Analytics UI | `/app/orgs/:id/analytics` |
| Billing UI | `/app/orgs/:id/billing` |
| White-label UI | `/app/orgs/:id/white-label` |
| Stripe webhook | `/api/v1/billing/webhooks/stripe` |
| Razorpay webhook | `/api/v1/billing/webhooks/razorpay` |

## Migration

`supabase/migrations/00011_analytics_billing_white_label.sql`

## Not claimed

Milestones 11–12. Live Stripe/Razorpay charge paths, live DNS verification, email delivery for scheduled reports.
