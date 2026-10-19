# Milestone 3 — CRM

## Persistence

| Mode | Store |
|------|--------|
| Local (default) | `node:sqlite` file at `.data/leadorbit.sqlite` (or `LEADORBIT_SQLITE_PATH`) |
| Supabase | SQL in `supabase/migrations/00004_crm_core.sql` — **not applied** until project credentials exist |

Tenancy auth remains in the Milestone 2 local store; every CRM call checks membership + `crm:*` permissions before touching SQLite.

## Features shipped

- Companies, contacts, leads, opportunities (deals)
- Pipelines/stages (lead + deal defaults)
- Tasks, notes, activities (timeline), attachment metadata
- Tags, custom field defs, saved views, segments scaffolding
- CSV import/export scaffolding; public capture with idempotency
- Duplicate detection + lead merge
- Ownership history; assignment strategies (round robin, workload, territory, availability, rules, manual)
- SLA due timestamps + escalation pass
- Follow-up reminders
- Kanban + table UI at `/app/orgs/:orgId/crm`

## Verified here

- Unit tests: assignment strategies, CRM cross-tenant denial, idempotent create, merge
- HTTP: create lead, cross-tenant list → 403, public capture idempotency, CRM page 200

## Not verified

- Postgres RLS on live Supabase
- Durable CSV worker (sync import only)
- Binary attachment storage beyond metadata paths
