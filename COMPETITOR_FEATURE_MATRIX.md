# Competitor Feature Matrix — LeadOrbit

**Purpose:** Map reference-product capabilities to LeadOrbit implementation intent.  
**Sources:** Public API docs, OAuth scopes, product/API catalogs, and indexed marketing summaries (2024–2026). No proprietary UI or closed documentation was copied.  
**Research caveat:** Direct fetches to some vendor marketing domains were blocked by the agent network allowlist; Sell.Do public detail is sparse — those rows are marked **Low confidence**.

Columns: **Reference product** | **Feature** | **User benefit** | **Implementation approach** | **Integration dependency** | **Priority / complexity** | **Acceptance criteria**

---

## Identity, tenancy & agency model

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Agency + location (sub-account) hierarchy | Agencies manage many clients under one login | `organizations` + `org_type` (`agency`/`workspace`) + parent_org_id; memberships RLS | Supabase Auth | P0 / High | User in agency A cannot read workspace B of another agency; sub-account switch works |
| HubSpot | Portal / teams / permissions | Safe collaboration | RBAC roles + resource scopes | Supabase Auth | P0 / Med | Role matrix enforced on API + RLS |
| LeadSquared | User & role APIs | Ops can provision sales users | Admin invite + role assignment API | Email provider | P0 / Med | Invite → accept → membership created |
| Zoho CRM | Org settings, multi-DC awareness | Global readiness | Single-region first; region field reserved | None (design) | P2 / Low | Schema documents `region` without fake multi-region |
| ActiveCampaign | Account-scoped API token | Integrators automate safely | Org-scoped API keys with hashed secrets | None | P1 / Med | Key auth works; raw key shown once |

---

## Lead capture & CRM core

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| LeadSquared | High-volume lead capture + Async API | Capture never blocks UX under load | Public ingest → queue → worker; idempotency keys | Worker runtime | P0 / High | Duplicate idempotency key does not create second lead |
| GoHighLevel | Contacts, tags, custom fields, notes, tasks | Complete day-to-day CRM | Domain tables + custom_field_defs JSON schema | Supabase | P0 / High | CRUD + search by tag/phone/email within org |
| HubSpot | Lifecycle stages (Lead→MQL→SQL→Customer) | Shared language for RevOps | `lifecycle_stage` enum + transition rules | None | P0 / Med | Illegal transitions rejected with 422 |
| Sell.Do (low conf.) | Real-estate lead distribution | Fair assignment across agents | Round-robin / weighted rules engine in worker | None | P1 / High | New lead assigned per active rule; audit event written |
| Zoho CRM | Lead convert → Contact/Account/Deal | Clean funnel progression | Transactional convert use-case | None | P1 / Med | Convert creates linked records atomically |
| ActiveCampaign | Contacts, lists, tags, custom fields | Marketing segmentation | Lists as saved segments + tag join table | None | P1 / Med | Segment query returns only org contacts |

---

## Pipelines & opportunities

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Opportunities + pipelines | Visual deal tracking | `pipelines`, `stages`, `opportunities` | None | P0 / Med | Drag/update stage persists; webhook optional |
| HubSpot | Deal pipelines + required fields | Process discipline | Stage gate configs | None | P1 / Med | Missing required fields block stage move |
| Zoho CRM | Blueprint-style transitions | Guided selling | Transition rules table | None | P2 / High | Disallowed transition returns error |
| LeadSquared | Opportunities + activities | Sales activity culture | Activity events linked to opp/lead | None | P0 / Med | Activity visible on timeline |
| Sell.Do (low conf.) | Site visit as first-class stage | RE sales reality | `appointments.kind = site_visit` + geo fields | Maps optional | P1 / Med | Site visit creates calendar + task |

---

## Conversations & messaging

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Unified conversations (SMS/email/FB/etc.) | One inbox | `threads` + `messages` + channel adapter | WhatsApp/SMS/Email providers | P0 / High | Inbound webhook creates/updates thread |
| ActiveCampaign | Email + SMS + WhatsApp APIs | Multichannel nurture | Channel adapters; WhatsApp when licensed | WhatsApp Cloud API, email ESP | P1 / High | Outbound WhatsApp sends only with valid creds; else blocked status |
| HubSpot | Sequences / meeting links | Sales cadence | Workflow + calendar modules | Calendar | P1 / Med | Sequence enroll creates scheduled jobs |
| LeadSquared | Call logs / activities | Dialer culture | Activity type `call` + optional recording URL | Telephony later | P2 / Med | Call log appears on lead |
| Zoho CRM | Email/call activities | History completeness | Same activity model | Email | P1 / Low | Sync or manual log supported |

---

## Automation & workflows

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Workflows + campaigns enroll/remove | Hands-free follow-up | JSON DSL + durable worker interpreter | Worker | P0 / High | Trigger fires action within SLA; retries on failure |
| ActiveCampaign | Automations (enter/exit, goals) | Marketing ops scale | Workflow graphs + enrollment table | Worker | P0 / High | Enrollment idempotent; exit rules respected |
| HubSpot | Workflows + lead scoring | Prioritize hot leads | Rules score + optional ML later | Worker / AI | P0 / Med | Score updates on activity; threshold can enroll |
| LeadSquared | Marketing automation + Lapps | Custom industry logic | Webhooks out + future function runners | Webhooks | P2 / High | Signed outbound webhook delivered |
| Zoho CRM | Workflow rules + blueprints | Process automation | Shared workflow engine | Worker | P1 / Med | Field-update trigger works |

---

## Calendars, bookings & visits

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Calendars, free slots, appointments | Book without Calendly | Availability rules + appointments API | Email/WhatsApp reminders | P1 / High | Free-slot query respects buffers/TZ |
| HubSpot | Meetings scheduler | Reduce back-and-forth | Public booking page per user/team | None | P1 / Med | Double-book prevented |
| Sell.Do (low conf.) | Site visit scheduling | Close RE deals | Appointment kind + project/location refs | Optional maps | P1 / Med | Visit status: scheduled/completed/no-show |
| LeadSquared | Tasks & appointments | Execution discipline | Tasks module | None | P0 / Low | Overdue task query works |

---

## Marketing assets & funnels

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Funnels, forms, surveys, websites | Capture + nurture sites | Forms + embed SDK first; page builder later | Storage CDN | P1–P2 / Very High | Form submit → lead + UTM preserved |
| HubSpot | Forms, landing pages, CMS | Inbound engine | Forms + hosted thank-you; CMS out of scope M1–6 | None | P1 / Med | Form spam honeypot + rate limit |
| ActiveCampaign | Campaigns + site messages | Engage known contacts | Campaign entity + send via worker | ESP | P1 / High | Campaign send audited; unsubscribe honored |
| GoHighLevel | Social planner | Social scheduling | Deferred; OAuth stubs only | Meta/LinkedIn/etc. | P3 / High | Not claimed until OAuth live |

---

## Payments & commerce

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | Invoices, orders, subscriptions | Collect revenue in-platform | `invoices` + payment intents | Stripe, Razorpay | P1 / High | Paid webhook marks invoice paid idempotently |
| HubSpot | Commerce / payments | Quote-to-cash | Payment links on opportunities | Stripe | P2 / Med | Link creates intent tied to opp |
| ActiveCampaign | Ecommerce entities | Store revenue sync | Ingest ecommerce events API | Optional | P2 / Med | Order event updates contact value |

---

## AI & conversational intelligence

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| HubSpot | Breeze / predictive scoring | Focus sellers | Heuristic score first; model later | AI provider optional | P0 / Med | Score always computed without AI key (rules fallback) |
| Zoho CRM | Zia-style AI assist | Faster CRM hygiene | Draft/summarize/next-action jobs | LLM API | P1 / High | AI action logged; human can edit before send |
| GoHighLevel | AI conversation / voice (evolving) | 24/7 response | Conversation agent in worker with takeover | LLM + WhatsApp | P1 / Very High | Auto-reply only when policy enabled; takeover stops AI |
| ActiveCampaign | Agent skills / MCP (ecosystem) | AI ops on marketing data | Expose read tools via future MCP; core product owns data | Optional | P3 / Med | Documented; not blocking core |
| Conversational AI (category) | Qualify + book via chat | Convert while sleeping | Intent extraction → lead fields + booking tool | LLM, calendar | P1 / High | Extracted budget/intent fields validated |

---

## Analytics & attribution

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| HubSpot | Funnel & attribution reports | Prove marketing ROI | Event warehouse tables + dashboards | Ads APIs later | P1 / High | Source→won report matches fixture data |
| GoHighLevel | Ad reporting scopes (FB/Google) | Media efficiency | Connection + sync jobs | Meta/Google Ads | P2 / High | Sync blocked clearly without OAuth |
| LeadSquared | Agent / campaign reporting | Manage teams | Activity aggregates | None | P1 / Med | Per-owner conversion report |
| ActiveCampaign | Campaign performance | Optimize sends | Open/click events | ESP webhooks | P1 / Med | Metrics match ingested events |

---

## Extensibility & developer platform

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| LeadSquared | REST + Async + webhooks | Reliable integration | OpenAPI + async job pattern | None | P0 / Med | OpenAPI validates; async status poll works |
| Zoho CRM | First-party OAS + OAuth scopes | Enterprise integrators | Contract-first packages | None | P0 / Med | `/contracts` OpenAPI stub published |
| GoHighLevel | Rich OAuth scopes & webhooks | App marketplace path | Webhook signing + scope map | None | P1 / High | Signature verification tested |
| ActiveCampaign | Broad OAS surface + API catalog | Automation builders | Versioned public API under `/api/v1` | None | P0 / Med | Breaking changes require version bump doc |

---

## White-label & SaaS mode

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| GoHighLevel | SaaS mode / white-label | Agencies resell | Branding settings + custom domain plan | DNS, Vercel | P2 / High | Subdomain branding applied; data still RLS-safe |
| Sell.Do (low conf.) | Industry-packaged RE CRM | Faster onboarding | Vertical templates (pipelines, fields) | None | P1 / Med | RE template seeds stages/fields |

---

## LeadOrbit-unique rows (must-build)

| Reference product | Feature | User benefit | Implementation approach | Integration dependency | Priority / complexity | Acceptance criteria |
|-------------------|---------|--------------|-------------------------|------------------------|----------------------|---------------------|
| LeadOrbit | Durable workers outside Vercel handlers | Reliable AI & automations | `apps/worker` + queue (Redis/pg-boss/Inngest-class) | Worker host | P0 / High | Job survives web deploy; retry documented |
| LeadOrbit | pgvector lead/memory embeddings | Similar leads & grounded AI | `embeddings` table + match RPC | Supabase pgvector | P1 / High | Similarity query returns same-org only |
| LeadOrbit | Dual payment rails (Stripe + Razorpay) | Global + India GTM | Payment provider interface | Stripe, Razorpay keys | P1 / High | Provider selected by org billing country |
| LeadOrbit | Spring-migration-ready contracts | Future enterprise backend | OpenAPI + hexagonal ports in packages | None | P0 / Low | `docs/MIGRATION_TO_JAVA.md` + stubs exist |

---

## Priority legend

- **P0** — Foundation / Milestone 1–3 critical path  
- **P1** — Core product differentiation (M4–8)  
- **P2** — Expansion (M9–11)  
- **P3** — Later / marketplace  

Complexity: Low | Med | High | Very High
