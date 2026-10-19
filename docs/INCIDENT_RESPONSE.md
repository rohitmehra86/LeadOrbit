# Incident response (operational)

This is an internal ops playbook, **not** a certified SOC2/ISO control.

## Severity

| Level | Example | Response |
|-------|---------|----------|
| SEV1 | Cross-tenant data leak, auth bypass, payment theft | Page immediately; stop the bleed; public status if customer-facing |
| SEV2 | Partial outage, webhook backlog, elevated 5xx | Mitigate within hours; notify affected tenants |
| SEV3 | Degraded feature, single-provider pending | Business hours fix |

## Roles

- **Commander:** coordinates (engineering lead / on-call)
- **Ops:** deploys, rollbacks, DB
- **Comms:** tenant updates (no speculation)

## First 15 minutes

1. Declare severity + commander
2. Preserve logs (do not wipe)
3. Stop the bleed (disable route/flag/keys; rollback)
4. Open incident channel/doc with timeline
5. If personal data exposure suspected → follow privacy notes (`docs/PRIVACY_DPDP.md`)

## Containment actions

- Rotate `SESSION_SECRET`, provider webhook secrets, Supabase service role if leaked
- Revoke platform admin grants as needed
- Pause workers if poisoned jobs loop
- Enable maintenance messaging on status page (when configured)

## Evidence to capture

- Git SHA / Vercel deployment URL
- `/api/v1/health?deep=1` and worker `/health` snapshots
- Relevant audit_logs / billing_webhook_events rows (no secrets)
- Approximate blast radius (org IDs, time window)

## Close-out

1. Root cause + fix PR
2. Customer notification if required by law/contract
3. Action items with owners
4. Update runbooks

## Contacts (fill when staffing)

| Role | Contact |
|------|---------|
| On-call eng | TBD |
| Privacy contact | TBD |
| Hosting (Vercel/Supabase) | vendor support portals |
