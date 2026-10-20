# LeadOrbit — plain-language overview

LeadOrbit is an **AI lead & revenue workspace**. One org = one company. Friends each use a **separate account** so data never collides.

## Demo URL (production)

**App:** https://leadorbit-delta.vercel.app  

Uses Supabase Auth + LeadOrbit Postgres (`kqmuxocbmtydkxdvmypy`). Not Linkbook.

| Link | Purpose |
|------|---------|
| [Signup](https://leadorbit-delta.vercel.app/signup) | Create your own isolated org |
| [Login](https://leadorbit-delta.vercel.app/login) | Sign in (pre-seeded friend accounts below) |
| [Health](https://leadorbit-delta.vercel.app/api/v1/health) | Expect `"authMode":"supabase"` |

Pre-seeded accounts (share one path per friend): see [`DEMO_ACCOUNTS.md`](./DEMO_ACCOUNTS.md).

## Shell navigation (left sidebar)

**Always visible (Simple mode)**

| Area | What it does |
|------|----------------|
| **AI Assistant** | Chat to create campaigns, leads, appointments |
| **Leads** | People who inquired; stages & follow-up |
| **Marketing** | Campaigns, forms, public pages, Launch Pack |
| **Sales & Appointments** | Follow-ups, hot leads, link to calendar |
| **Results** | Funnel / performance (ad spend needs Meta/Google) |
| **Settings** | Org basics |

**Advanced / Expert** (toggle at bottom of sidebar)

| Extra | Purpose |
|-------|---------|
| **Real estate** | Developers, projects, units, enquiries, site visits |
| CRM board, Workflows, Inbox | Optional ops |
| Integrations, Billing, White label | Expert; need real credentials |

## Simple vs Advanced

- **Simple** — marketing friend day-to-day path.
- **Advanced** — shows **Real estate** (first under Advanced) for broker demos.
- **Expert** — full module list.

## Two friend journeys

1. **Marketing** — Launch Pack → publish → public form → lead → Results → [`WALKTHROUGH_MARKETING.md`](./WALKTHROUGH_MARKETING.md)
2. **Broker** — Advanced → Real estate → inventory → enquiry → site visit → Sales → [`WALKTHROUGH_REAL_ESTATE.md`](./WALKTHROUGH_REAL_ESTATE.md)
