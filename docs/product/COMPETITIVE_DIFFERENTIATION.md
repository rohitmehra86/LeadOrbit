# LeadOrbit — Competitive Differentiation

**Last updated:** 2026-10-20  
**Rule:** Hypotheses below are **validated**, **plausible**, or **untested**. Do not market untested items as proven.

---

## ICP (working assumption)

Agencies and growth teams (including real-estate / high-consideration SMB) who want GHL-like breadth without consultant-level UI complexity, and HubSpot-like CRM hygiene without enterprise packaging.

---

## Hypotheses

### H1 — AI-first shell beats feature sprawl for SMB operators

| | |
|--|--|
| **Claim** | A 6-item nav (Assistant, Leads, Marketing, Sales, Results, Settings) + Simple/Advanced/Expert modes reduces time-to-first-campaign vs GHL’s dense IA. |
| **Status** | **Plausible / shipping now** — shell + Launch Pack implemented; not yet A/B tested with customers. |
| **Evidence needed** | Timed onboarding study vs GHL/HubSpot for “publish lead form + see first lead.” |
| **Counter** | Power users may bounce if Expert mode hides too much. Mitigation: Expert exposes prior modules. |

### H2 — Typed, permission-checked assistant tools beat chatty copilots

| | |
|--|--|
| **Claim** | Exact tool plans + approvals for publish/spend/bulk outperform free-form LLM write that bypasses RBAC. |
| **Status** | **Plausible** — assistant executes only typed tools with role gates; LLM still optional/`blocked`. |
| **Evidence needed** | Incident rate (unauthorized publish) + task success vs unconstrained chat. |
| **Counter** | Feels “less magic” than ChatGPT-in-CRM demos. Mitigation: clear success/fail reports. |

### H3 — Deterministic qualification is enough for v1 without LLM spend

| | |
|--|--|
| **Claim** | Budget/location/timeline scoring (`qualifyLeadDeterministic`) delivers useful next actions without API keys. |
| **Status** | **Validated in code/tests** — unit coverage in `packages/domain/src/ai.test.ts`; not field-validated. |
| **Evidence needed** | Win-rate / connect-rate lift after score-based routing. |

### H4 — India/real-estate ICP needs localization + inventory, not just US GHL clone

| | |
|--|--|
| **Claim** | RE inventory + multilingual extract + Razorpay path creates regional advantage vs pure GHL. |
| **Status** | **Partial product** (RE module local-verified); go-to-market **untested**. |
| **Evidence needed** | Design-partner win stories. |

### H5 — Open integration spine (Zapier/n8n) > rebuilding every connector

| | |
|--|--|
| **Claim** | Native core loop + Zapier/n8n for long-tail beats GHL’s closed ecosystem lock-in narrative. |
| **Status** | **Untested** — native workflows exist; Zapier/n8n not wired. |
| **Evidence needed** | Connector coverage used by 10 design partners. |

---

## What we will NOT claim yet

- Full feature parity with GoHighLevel, HubSpot, or Salesforce.
- Live Meta/Google ads, WhatsApp delivery, Stripe checkout, or calendar OAuth without credentials.
- Staging durability for CRM/marketing under Supabase until domain adapters exist.
- Compliance certifications (DPDP/SOC2) — docs only.

---

## Differentiation summary (honest)

| Differentiator | Today | Target |
|----------------|-------|--------|
| AI operator over full CRM/marketing | Shipping (typed tools) | Default path for all Simple users |
| Progressive disclosure one product | Shipping | Persist mode per user/org |
| Deterministic qualify always-on | Shipping | + optional LLM when keyed |
| Agency white-label + multi-tenant | Partial | Production entitlements |
| Regional RE / payments | Partial / blocked | Design partners |
