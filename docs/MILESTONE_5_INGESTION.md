# Milestone 5 — Lead ingestion, integrations & attribution

## Persistence

| Mode | Store |
|------|--------|
| Local (default) | `node:sqlite` (shared `.data/leadorbit.sqlite`) |
| Supabase | `supabase/migrations/00006_ingestion_attribution.sql` — **not applied** until credentials exist |

## Pipelines

| Channel | Entry |
|---------|--------|
| Form / landing page | Public form submit → CRM lead + attribution touchpoint |
| Public capture | `POST /api/v1/public/leads` via ingestion store |
| Signed webhook | `POST /api/v1/public/webhooks/:orgId/:endpointId` |
| Meta / Google lead ads | Authorize + pull stubs (`pending_configuration` / imported=0) |

## Security & reliability

- HMAC-SHA256 signatures (`timestamp.body`, `sha256=` prefix)
- Idempotency keys namespaced by channel
- Duplicate fingerprint at ingestion boundary
- Outbound delivery status sync scaffolding (retry → dead_letter)
- Ingestion event audit trail (tenant-scoped)

## Attribution

UTM → campaign match → touchpoints on lead → first/last/linear models → optional opportunity link.

## Verified

- Unit: signature validation, attribution models, delivery retries
- Store: signed webhook ingest, idempotent redelivery, cross-tenant denial, Meta pull imported=0
- HTTP smoke after commit

## Not claimed

- Live Meta/Google Ads API lead pull
- Live outbound HTTP webhook delivery
- Postgres RLS on remote Supabase
- Milestone 6+
