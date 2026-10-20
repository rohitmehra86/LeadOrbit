# LeadOrbit — Competitor Feature Matrix

**Last updated:** 2026-10-20  
**Method:** Public product pages, developer docs, and official API catalogs only. No proprietary UI/UX copying.  
**LeadOrbit status legend:** `working/verified` (local SQLite + tests) · `partial` · `UI/stub` · `missing` · `blocked (creds)` · `N/A`

> Staging/`AUTH_MODE=supabase` today can authenticate and create orgs, but CRM/marketing/domain data still uses local SQLite adapters — treat Vercel product data as **non-durable** until Postgres adapters ship.

---

## Capability rows

### 1. All-in-one CRM + marketing workspace

| Field | Detail |
|-------|--------|
| **Customer problem** | Teams juggle CRM, ads, forms, inbox, and calendar across tools and lose attribution. |
| **Products + sources** | [GoHighLevel API SDK](https://github.com/gohighlevel/highlevel-api-sdk) (contacts, campaigns, forms, calendars, conversations, workflows, ads); [HubSpot CRM API](https://developers.hubspot.com/docs/api-reference/latest/crm/understanding-the-crm); [Salesforce Sales Cloud](https://www.salesforce.com/products/sales-cloud/overview/) + [REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm); Zoho CRM (public site); LeadSquared / Sell.Do / Marketing 360 (India SMB/real-estate CRMs — public marketing sites; agent egress blocked detailed fetch). |
| **LeadOrbit status** | `working/verified` local for CRM + campaigns + forms + workflows + inbox model + calendar model; `partial` on live staging durability. |
| **Native / integration / plan** | **Native** core objects; **integrate** Meta/Google ads, WhatsApp, ESP, calendar OAuth; **plan** Postgres adapters + agency white-label. |
| **API / auth** | LeadOrbit `/api/v1` BFF + cookie/JWT (local) or Supabase Auth; competitors: OAuth2 (GHL, HubSpot, Salesforce), tenant REST. |
| **Value** | One permissioned workspace for lead→revenue loop. |
| **Complexity / cost** | High surface area; start with AI shell over existing modules. |
| **Security / privacy** | RLS migrations exist; DPDP notes scaffolded — not certified. |
| **LeadOrbit approach** | Keep domain modules; default UX = 6-nav AI shell with progressive disclosure. |
| **Acceptance** | User completes lead capture→CRM→results without leaving shell. |
| **Deps / priority** | P0 — UX shell + durable adapters. |

### 2. Natural-language operator (AI assistant)

| Field | Detail |
|-------|--------|
| **Customer problem** | Power features exist but SMBs cannot discover or operate them. |
| **Products + sources** | GHL Agent Studio / Conversation AI (SDK surface); HubSpot Breeze (product marketing); Salesforce Einstein / Marketing Cloud MCP tooling; Zapier MCP/SDK for agent tool access ([zapier/sdk](https://github.com/zapier/sdk)). |
| **LeadOrbit status** | `partial` — deterministic qualify + persona turns (`packages/domain/src/ai.ts`, `AiStore.runTurn`); LLM gateway `blocked (creds)`; **assistant tool loop shipping this milestone** (permission-checked). |
| **Native / integration / plan** | Native intent→tools; optional LLM when keys present; Zapier/n8n for long-tail apps later. |
| **API / auth** | `/api/v1/orgs/:id/assistant/chat` + typed tools; approvals for consequential actions. |
| **Value** | 10× faster campaign launch and lead ops for non-experts. |
| **Complexity / cost** | Medium if tools wrap existing stores; high if open-ended LLM write. |
| **Security / privacy** | No permission bypass; approval gates for publish/bulk/spend/appointments/billing. |
| **LeadOrbit approach** | Typed tools only; plan→approve→execute→report. |
| **Acceptance** | NL “launch lead magnet” creates campaign+form+page and returns public URL after approval. |
| **Deps / priority** | P0. |

### 3. Campaign + form + landing capture with attribution

| Field | Detail |
|-------|--------|
| **Customer problem** | Ads and forms don’t write clean CRM leads with UTM/attribution. |
| **Products + sources** | GHL campaigns/forms/funnels; HubSpot Marketing + forms; Salesforce Marketing Cloud journeys ([API catalog](https://raw.githubusercontent.com/api-evangelist/salesforce-marketing-cloud/refs/heads/main/apis.yml)). |
| **LeadOrbit status** | `working/verified` local (`CampaignStore`, public form submit, attribution); Meta/Google lead ads `blocked (creds)` / stub. |
| **Native / integration / plan** | Native form+page+UTM; integrate ad networks when creds exist. |
| **API / auth** | Authenticated campaign APIs + public form submit. |
| **Value** | Measurable lead gen without Zap glue. |
| **Complexity / cost** | Medium. |
| **Security / privacy** | Spam honeypot, consent text, org-scoped. |
| **LeadOrbit approach** | Guided Launch Pack as first E2E win. |
| **Acceptance** | Public submit creates lead + attribution + shows in Results. |
| **Deps / priority** | P0. |

### 4. Lead qualification & routing

| Field | Detail |
|-------|--------|
| **Customer problem** | Reps waste time on junk leads; no consistent next action. |
| **Products + sources** | HubSpot lead scoring; Salesforce assignment rules; LeadSquared / Sell.Do routing (market claims). |
| **LeadOrbit status** | `working/verified` local CRM + assignment rules + deterministic AI qualify; live LLM `blocked`. |
| **Native / integration / plan** | Native deterministic qualify; LLM optional enhancement. |
| **API / auth** | CRM + AI run APIs; assistant `qualify_lead` tool. |
| **Value** | Faster speed-to-lead quality. |
| **Complexity / cost** | Low–medium. |
| **Security / privacy** | Org-scoped; no cross-tenant. |
| **LeadOrbit approach** | Auto-qualify on capture; surface score in Leads/Results. |
| **Acceptance** | Captured lead has score + missing-fields + next action. |
| **Deps / priority** | P0. |

### 5. Workflows / automation

| Field | Detail |
|-------|--------|
| **Customer problem** | Manual follow-up drops after first touch. |
| **Products + sources** | GHL workflows; HubSpot Automation; Zapier 9k+ apps ([zapier.com](https://zapier.com)); n8n public API ([docs](https://docs.n8n.io/api/)). |
| **LeadOrbit status** | `working/verified` local workflow store + worker ticks; outbound message steps `blocked (creds)`. |
| **Native / integration / plan** | Native core triggers; Zapier/n8n for long-tail. |
| **API / auth** | Workflow CRUD + worker jobs. |
| **Value** | Reliable follow-up without consultant. |
| **Complexity / cost** | High for parity; ship trigger templates first. |
| **Security / privacy** | Approval for bulk outbound. |
| **LeadOrbit approach** | Templates from Launch Pack; Expert mode for builder. |
| **Acceptance** | Form submit triggers workflow run locally. |
| **Deps / priority** | P1. |

### 6. Omnichannel inbox & messaging

| Field | Detail |
|-------|--------|
| **Customer problem** | WhatsApp/email/SMS silos. |
| **Products + sources** | GHL conversations; HubSpot Conversations; WhatsApp Business APIs (vendor). |
| **LeadOrbit status** | `partial` — inbox model + UI; send adapters `blocked (creds)`. |
| **Native / integration / plan** | Native thread model; integrate WA/ESP/SMS. |
| **API / auth** | Inbox APIs + signed public webhooks. |
| **Value** | One queue for sales. |
| **Complexity / cost** | High (compliance + providers). |
| **Security / privacy** | Opt-outs, templates, audit. |
| **LeadOrbit approach** | Keep model; mark send blocked until creds. |
| **Acceptance** | Local thread CRUD; live send when keys set. |
| **Deps / priority** | P1. |

### 7. Calendar, appointments, voice

| Field | Detail |
|-------|--------|
| **Customer problem** | Booking friction kills conversion. |
| **Products + sources** | GHL calendars; HubSpot Meetings; Salesforce Scheduler. |
| **LeadOrbit status** | `partial` — booking model + public booking API; OAuth/telephony `blocked`. |
| **Native / integration / plan** | Native booking; Google/Microsoft OAuth later. |
| **API / auth** | Calendar/appointment APIs. |
| **Value** | Capture→book loop. |
| **Complexity / cost** | Medium–high. |
| **Security / privacy** | Approval for appointment create via assistant. |
| **LeadOrbit approach** | Sales & Appointments nav; Simple mode = booking link. |
| **Acceptance** | Book appointment locally without OAuth. |
| **Deps / priority** | P1. |

### 8. Analytics / Results

| Field | Detail |
|-------|--------|
| **Customer problem** | Owners cannot see what worked this week. |
| **Products + sources** | HubSpot reporting; Salesforce reports; GHL dashboards. |
| **LeadOrbit status** | `working/verified` local analytics aggregates + CSV export. |
| **Native / integration / plan** | Native Results home; BI export later. |
| **API / auth** | Analytics APIs. |
| **Value** | Decide next spend/action. |
| **Complexity / cost** | Low for v1 signals. |
| **Security / privacy** | Org-scoped metrics. |
| **LeadOrbit approach** | Results nav = campaign leads + qualify scores. |
| **Acceptance** | Launch Pack leads appear in Results. |
| **Deps / priority** | P0 (signal), P2 (full BI). |

### 9. Billing, entitlements, white-label

| Field | Detail |
|-------|--------|
| **Customer problem** | Agencies need plans + client branding. |
| **Products + sources** | GHL SaaS mode; HubSpot tiers; Salesforce editions. |
| **LeadOrbit status** | `partial` — entitlements/quotas/UI; Stripe/Razorpay checkout `blocked`. |
| **Native / integration / plan** | Native gates; Stripe/Razorpay when keys set. |
| **API / auth** | Billing + white-label APIs. |
| **Value** | Monetize + agency reseller. |
| **Complexity / cost** | Medium. |
| **Security / privacy** | Service-role never client-side; approval for billing tools. |
| **LeadOrbit approach** | Settings/Expert; do not block Simple mode. |
| **Acceptance** | Entitlement read works; live checkout when keys present. |
| **Deps / priority** | P2. |

### 10. Enterprise depth (custom objects, SOQL-class query, multi-cloud)

| Field | Detail |
|-------|--------|
| **Customer problem** | Large orgs need extreme customization. |
| **Products + sources** | Salesforce platform APIs (REST/SOAP/Metadata/PubSub). |
| **LeadOrbit status** | `missing` / `N/A` near-term. |
| **Native / integration / plan** | **Do not chase** Salesforce platform depth; win SMB AI simplicity. |
| **API / auth** | N/A |
| **Value** | Low for ICP (agencies / mid-market growth teams). |
| **Complexity / cost** | Very high. |
| **Security / privacy** | N/A |
| **LeadOrbit approach** | Explicit non-goal until ICP expands. |
| **Acceptance** | Documented as non-goal. |
| **Deps / priority** | P3 / defer. |

---

## Cross-product notes (limitations of research)

- LeadSquared, Sell.Do, Marketing 360: public sites partially egress-blocked in agent network; treat feature claims as **market positioning**, not verified API inventories.
- Zoho: same egress limit for deep docs; CRM suite breadth assumed from public product family.
- “Parity” means **ICP-relevant capability**, not Salesforce Feature Count™.
