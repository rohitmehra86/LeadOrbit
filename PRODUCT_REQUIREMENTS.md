# LeadOrbit — Product Requirements Document

**Product name:** LeadOrbit  
**Codename / repo intent:** `ai-lead-revenue-cloud`  
**Owner:** Rohit Mehra  
**Status:** Foundation (Milestone 1)  
**Classification:** Multi-tenant AI Lead & Revenue Cloud SaaS (production-grade target; not an MVP mock)

---

## 1. Vision

LeadOrbit is a multi-tenant AI Lead & Revenue Cloud that helps agencies, brokerages, educators, and SMB growth teams **capture, qualify, converse, assign, nurture, and convert leads into measurable revenue** — with first-class India/MENA channel realities (WhatsApp, Razorpay/UPI, Meta/Google ads) and AI agents that operate inside durable workflows, not chat demos.

Differentiator vs classic CRM + marketing stacks:

1. **AI-native lead ops** — scoring, next-best-action, conversation assist, and campaign suggestion grounded in tenant data (pgvector + activity graph).  
2. **Revenue cloud loop** — lead → opportunity → booking/payment → attribution → retention, not CRM-only.  
3. **Agency + sub-account tenancy** — white-label-ready org model inspired by agency platforms, with strict RLS.  
4. **Contract-first APIs** — OpenAPI domain contracts ready for a future Spring Boot extract without rewriting clients.

---

## 2. Problem statement

Growth teams juggle fragmented tools (ads, forms, WhatsApp, CRM, dialers, payment links). Lead leakage happens at handoffs; attribution is opaque; AI pilots fail because they sit outside the system of record. Existing leaders (GoHighLevel, HubSpot, LeadSquared, Sell.Do, Zoho CRM, ActiveCampaign) cover pieces well but leave gaps for AI-orchestrated, multi-tenant revenue ops with India-first channels and clean migration paths to enterprise Java backends.

---

## 3. Target users & personas

| Persona | Needs |
|---------|--------|
| **Agency owner** | Multi-client workspaces, billing, white-label, staff roles |
| **RevOps / marketing manager** | Attribution, funnels, automations, consent, lists |
| **Sales manager** | Pipelines, SLAs, lead distribution, forecasting |
| **Sales executive / counselor** | Inbox, tasks, scripts, visit booking, mobile-first |
| **Platform admin (LeadOrbit)** | Tenant provisioning, abuse controls, observability |
| **Developer / integrator** | Webhooks, OpenAPI, API keys, idempotent ingest |

Vertical focus (initial): real estate, education / coaching, local services, agencies reselling to those verticals.

---

## 4. Goals & non-goals

### Goals (12-milestone horizon)

- Multi-tenant auth, orgs, memberships, RBAC, RLS isolation  
- Lead capture (forms, webhooks, CSV, ad sync), dedupe, scoring  
- Omnichannel conversations (email, WhatsApp, SMS where licensed)  
- Pipelines, tasks, calendars / site visits  
- Workflow automation with durable workers  
- AI assist: score, summarize, draft, recommend next action  
- Billing (Stripe + Razorpay path), usage metering  
- Attribution dashboards; exportable audit logs  
- Production CI/CD on Vercel + Supabase + worker runtime  

### Non-goals (this phase)

- Building a full website/funnel page builder parity with GHL  
- Migrating runtime to Spring Boot (document contracts only)  
- Claiming Meta/Google/WhatsApp/Stripe certification without credentials  
- Replacing enterprise telephony PBX  

---

## 5. Competitive positioning (summary)

| Reference | Strength we respect | LeadOrbit wedge |
|-----------|---------------------|-----------------|
| **GoHighLevel** | Agency/sub-account, conversations, calendars, workflows, SaaS mode | Stronger AI + vector memory; cleaner API/contracts; India payments |
| **HubSpot** | Lifecycle, marketing automation, reporting depth | Faster SMB/agency time-to-value; WhatsApp-first; lower lock-in |
| **LeadSquared** | High-volume lead ops, async ingest, India sales DNA | Modern AI + open contracts; productized agency tenancy |
| **Sell.Do** | Real-estate lead distribution & site visits | Broader verticals + AI revenue loop beyond RE |
| **Zoho CRM** | Modular CRM + Zia AI | Opinionated lead-revenue cloud vs general CRM |
| **ActiveCampaign** | Automations, email/WhatsApp messaging APIs | CRM + revenue + agency model in one cloud |

Full matrix: [`COMPETITOR_FEATURE_MATRIX.md`](./COMPETITOR_FEATURE_MATRIX.md).

---

## 6. Functional requirements (by domain)

### 6.1 Identity & tenancy

- Email/password + OAuth (Google) via Supabase Auth  
- Organizations (tenants), optional agency → sub-account hierarchy  
- Memberships with roles: `owner`, `admin`, `manager`, `agent`, `viewer`  
- Invite flows; session + JWT; service role never exposed to browser  
- All business rows carry `org_id`; RLS enforces isolation  

### 6.2 Lead & contact domain

- Leads with source, stage, score, owner, tags, custom fields  
- Contacts / companies (B2B path) with conversion from lead  
- Deduping rules (email/phone normalized per org)  
- Activity timeline (immutable event log)  
- Import/export CSV; public capture API with signed tokens  

### 6.3 Pipeline & revenue

- Configurable pipelines & stages  
- Opportunities with amount, currency, probability, close date  
- Booking / payment intents linked to opportunities  
- Lost reasons; won → customer record  

### 6.4 Conversations & channels

- Unified inbox model (thread + messages)  
- Email (transactional + marketing path)  
- WhatsApp Business Cloud API (when credentials provided)  
- SMS provider adapter (pluggable)  
- Human takeover; AI draft suggestions; assignment rules  

### 6.5 Automation & AI

- Trigger → condition → action workflows stored as JSON DSL  
- Durable job execution outside Vercel request handlers  
- AI jobs: score lead, summarize thread, draft reply, suggest next action  
- Embeddings stored via pgvector for similar-lead / knowledge retrieval  
- Guardrails: PII redaction hooks, prompt versioning, audit of AI actions  

### 6.6 Calendar & tasks

- Tasks with due dates, owners, SLAs  
- Appointment slots; site-visit type for real estate  
- Reminders via worker schedules  

### 6.7 Marketing & attribution

- Forms, landing capture endpoints  
- UTM & click IDs preserved  
- Ad account connection stubs → full sync when Meta/Google approved  
- Source → MQL → SQL → Won funnel reports  

### 6.8 Billing & platform

- Plans, seats, usage meters  
- Stripe (global) + Razorpay (India) adapters  
- Feature flags per plan  
- Platform admin console (internal)  

### 6.9 Platform quality

- OpenAPI 3.1 contracts per bounded context  
- Structured logging, OpenTelemetry hooks  
- CI: lint, typecheck, unit, contract tests  
- Disaster recovery notes for Supabase backups  

---

## 7. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Security | RLS, least-privilege keys, secret scanning, CSRF on cookie auth |
| Isolation | No cross-tenant reads even with guessed UUIDs |
| Latency | Capture API p95 < 300ms (enqueue AI async) |
| Durability | Workers retry with backoff; idempotency keys on ingest |
| Availability | Web on Vercel; DB Supabase; workers separate process/service |
| Compliance posture | Consent fields, DND flags, export/delete request workflows |
| Scalability | Partition heavy event tables by time; queue-backed AI |
| Observability | Correlation IDs across web → API → worker |

---

## 8. Success metrics

- Lead capture success rate ≥ 99.5% (accepted + queued)  
- Time-to-first-touch (automation or human) measurable per tenant  
- AI draft acceptance rate tracked  
- Tenant churn / expansion via seat & usage metrics  
- Zero confirmed cross-tenant data leaks in security tests  

---

## 9. Milestones overview

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) (Milestones 1–12).  
Honest progress: [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

---

## 10. Research notes & constraints

Public competitor marketing sites were partially unreachable from this agent environment (network allowlist). Feature inference uses **public API documentation, OAuth scopes, and published product/API catalogs** only — no proprietary UI copying.

Credentials required from Rohit before claiming production integrations: GitHub private repo auth, Vercel, Supabase project, Meta/Google Ads, WhatsApp Business, Stripe/Razorpay.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| Org / Tenant | Billing and data isolation boundary |
| Sub-account | Child workspace under an agency org |
| Lead | Pre-opportunity prospect record |
| Opportunity | Pipeline deal with revenue potential |
| Worker | Durable process outside serverless request path |
| Contract | OpenAPI + shared TypeScript types for a domain |
