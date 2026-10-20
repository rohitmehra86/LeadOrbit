# LeadOrbit — plain-language overview

LeadOrbit is an **AI lead & revenue workspace**. One org = one company. Friends should each use their **own signup** (or a pre-seeded demo org) so data never collides.

## Reliable demo path

| Path | When to use |
|------|-------------|
| **Local** `pnpm local:demo` → http://127.0.0.1:43127 | **Preferred for friend demos.** `AUTH_MODE=local`, no Supabase needed. |
| **Vercel** https://leadorbit-delta.vercel.app | Needs working Supabase auth/env. Signup can be flaky if project env is incomplete — don’t rely on it for timed demos. |

After local start: `pnpm demo:seed` creates two separate orgs (marketing + real estate). Accounts land in `.data/demo-seed.json`.

## Shell navigation (left sidebar)

**Always visible (Simple mode)**

| Area | What it does |
|------|----------------|
| **AI Assistant** | Chat to create campaigns, leads, appointments in plain language |
| **Leads** | Inbox of people who inquired; stages & follow-up |
| **Marketing** | Campaigns, forms, public pages, Launch Pack / Marketplace |
| **Sales & Appointments** | Bookings, site visits, sales pipeline |
| **Results** | Funnel / performance snapshot (spend needs ad credentials) |
| **Settings** | Org basics |

**Advanced / Expert** (toggle at bottom of sidebar)

Shows extra modules. For broker demos, switch to **Advanced** or **Expert** so **Real estate** appears (first in the Advanced list).

| Extra | Purpose |
|-------|---------|
| **Real estate** | Developers, projects, units, buyer prefs, enquiries, site visits |
| CRM board, Workflows, Inbox, AI lab | Deeper ops (optional for friends) |
| Integrations, Billing, White label | Expert-only; Meta/Google/Stripe need real credentials |

## Simple vs Advanced

- **Simple** — day-to-day: Assistant → Marketing/Leads → Sales → Results.
- **Advanced** — adds Real estate + a few ops tools (enough for broker demos).
- **Expert** — full module list including Billing / White label / Integrations.

Friends only need Simple (marketing) or Advanced (broker).

## Two friend journeys (independent)

1. **Marketing expert** — Launch Pack → publish page → capture lead → Results. See `WALKTHROUGH_MARKETING.md`.
2. **Real estate broker** — enable RE → inventory → enquiry → qualify → site visit → Sales. See `WALKTHROUGH_REAL_ESTATE.md`.

Accounts & reset: `DEMO_ACCOUNTS.md`.
