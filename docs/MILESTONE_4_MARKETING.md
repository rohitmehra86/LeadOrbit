# Milestone 4 — Campaigns, forms, landing pages & funnels

## Persistence

| Mode | Store |
|------|--------|
| Local (default) | `node:sqlite` (same `.data/leadorbit.sqlite` as CRM) |
| Supabase | `supabase/migrations/00005_marketing_campaigns.sql` — **not applied** until credentials exist |

Every authenticated marketing call checks org membership + `campaigns:*` / `forms:*` / `pages:*` permissions.

## Features shipped

- Campaign CRUD: objectives, audience, ad copy, budget, schedule, status, UTM generation, A/B scaffold, duplication, templates, performance from persisted `marketing_events`
- Creative asset library (metadata paths)
- AI copy/page suggestion hooks (provider-agnostic; `unverified` without LLM key)
- Meta / Google Ads authorize-flow stubs → `pending_configuration` without credentials (never fake live success)
- Form builder: drag reorder, field types, multi-step, templates, validation, honeypot, duplicate fingerprint, CRM mapping, embed snippet, versioning, webhooks scaffolding
- Landing page builder: structured blocks, safe render (no script exec), drag reorder, real-estate template, SEO, draft/publish, duplication, version history, mobile preview, consent notices
- Funnels: multi-step scaffolding linked to campaign/page/form
- Public page `/p/:orgId/:slug` + public form submit → tenant-scoped submission + CRM lead
- Attribution scaffolding via campaign UTM + last/first/linear model field

## Verified here

- Unit: domain UTM/sanitize/validate/AI/ad stubs; store cross-tenant denial; form submit → lead; duplicate detection; page publish; Meta pending
- HTTP smoke (after commit): campaigns, cross-tenant 403, form publish/submit, marketing UI 200

## Not verified / blocked

- Live Meta/Google Ads API sync
- Live LLM provider calls
- Postgres RLS on remote Supabase
- Webhook delivery to external URLs
