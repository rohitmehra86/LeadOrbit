# Privacy & DPDP operational notes

**Important:** This document is operational guidance for engineering. It is **not** a legal opinion, **not** a certification of DPDP / GDPR compliance, and **not** evidence that LeadOrbit is commercially “compliance ready.” Engage counsel for formal assessments.

## Principles we implement in product

- Tenant isolation via membership checks (local) and RLS (Supabase migrations)
- No storage of raw card data — payment providers tokenize
- Privacy export scaffold: `POST /api/v1/orgs/:id/privacy/export`
- Deletion request scaffold: `POST /api/v1/orgs/:id/privacy/delete-request` (`confirm: "DELETE"`)
- Audit trails for sensitive org actions (local store + SQL audit_logs)

## DPDP-oriented ops checklist (India)

Track these as work items — **unchecked until verified**:

- [ ] Privacy policy + terms URLs on production domain
- [ ] Lawful purpose / consent copy on public forms (product already supports consent fields)
- [ ] Data principal request intake (export/delete) with SLA
- [ ] Processor agreements with Supabase, Vercel, LLM, Stripe/Razorpay, SMS/voice
- [ ] Cross-border transfer assessment for each vendor region
- [ ] Breach notification runbook timings reviewed by counsel
- [ ] Retention schedule for leads, messages, recordings, logs

## Data classes (engineering view)

| Class | Examples | Handling notes |
|-------|----------|----------------|
| Account | email, name | Auth provider + profiles |
| CRM | leads, notes, opps | Org-scoped; exportable |
| Comms | inbox messages, call metadata | Minimize retention; consent for recording |
| Billing | invoices, subscription status | No PAN/CVV in our DB |
| Secrets | API keys | Env/secret managers only |

## Breach suspicion

1. Follow `docs/INCIDENT_RESPONSE.md` SEV1
2. Preserve logs
3. Assess personal data involved
4. Notify privacy contact / counsel before external statements
5. Do **not** claim “DPDP compliant” in customer comms without legal sign-off
