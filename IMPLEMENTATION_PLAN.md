# LeadOrbit — Implementation Plan (Milestones 1–12)

Each milestone lists **tasks** and **acceptance criteria**. Do not mark complete without verification evidence in [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

---

## Milestone 1 — Foundation & scaffolding

**Goal:** Repo, docs, monorepo boundaries, CI skeleton, base Next.js app, OpenAPI stub, Java-migration starter doc.

### Tasks

1. Competitive research notes → PRD + feature matrix  
2. Architecture + database design docs  
3. pnpm + Turborepo monorepo (`apps/web`, `apps/worker`, `packages/*`, `supabase/`, `docs/`, `tests/`)  
4. Base Next.js App Router app (TS, Tailwind)  
5. Worker package skeleton with `JobQueue` port  
6. Shared packages: `domain`, `api-contracts`, `db`, `ui`, `config`  
7. OpenAPI stub for health + tenancy placeholders  
8. GitHub Actions: install, lint, typecheck, unit test  
9. `docs/MIGRATION_TO_JAVA.md`  
10. Honest `IMPLEMENTATION_STATUS.md`  
11. Private GitHub repo if `gh` authorized; else document blocker  
12. Draft PR when remote exists  

### Acceptance criteria

- [ ] All six root docs present and linked from README  
- [ ] `pnpm install` + `pnpm typecheck` + `pnpm lint` succeed locally  
- [ ] Web app boots on uncommon port  
- [ ] CI workflow file exists and is valid YAML  
- [ ] No fake “production ready” claims  
- [ ] Package import boundaries documented  

---

## Milestone 2 — Auth & multi-tenancy

### Tasks

1. Supabase project wiring (env templates + local config)  
2. Profiles, organizations, memberships, invites migrations + RLS  
3. Sign-up / sign-in / sign-out UI + server session  
4. Org create + switcher  
5. Role guards on routes/API  
6. RLS negative tests (two-org fixture)  

### Acceptance criteria

- [ ] User can register, create org, invite member  
- [ ] Cross-tenant read attempts fail at RLS  
- [ ] Service role not exposed to client  

---

## Milestone 3 — Lead capture & CRM core

### Tasks

1. Leads/contacts/companies/tags/activities schema  
2. Public capture API with idempotency  
3. CSV import job (worker)  
4. Lead list/detail UI with filters  
5. Activity timeline  

### Acceptance criteria

- [ ] Capture p95 enqueue < 300ms in staging test  
- [ ] Duplicate idempotency key is no-op  
- [ ] Activity appears for create/update/assign  

---

## Milestone 4 — Pipelines & opportunities

### Tasks

1. Pipeline/stage/opportunity schema + APIs  
2. Kanban UI  
3. Lead → opportunity conversion  
4. Stage-gate validation  

### Acceptance criteria

- [ ] Stage moves persist and audit  
- [ ] Conversion transactional  

---

## Milestone 5 — Conversations inbox

### Tasks

1. Threads/messages schema  
2. Email adapter (transactional provider)  
3. WhatsApp adapter behind feature flag  
4. Inbox UI + assignment  
5. Inbound webhook signature verification  

### Acceptance criteria

- [ ] Inbound email/WhatsApp (when configured) creates thread  
- [ ] Unconfigured providers show blocked status, not fake success  

---

## Milestone 6 — Automation engine

### Tasks

1. Workflow DSL + storage  
2. Durable worker interpreter  
3. Triggers: lead created, stage changed, tag added, time elapsed  
4. Actions: assign, notify, enroll, webhook, AI score  

### Acceptance criteria

- [ ] Sample nurture flow runs end-to-end in staging  
- [ ] Failed steps retry with backoff; dead-letter visible  

---

## Milestone 7 — AI assist & pgvector

### Tasks

1. Embeddings table + match RPC  
2. Jobs: score, summarize, draft reply, next action  
3. Rules fallback without LLM key  
4. Prompt versioning + AI audit log  

### Acceptance criteria

- [ ] Similarity search RLS-safe  
- [ ] Product usable without LLM (degraded)  
- [ ] AI actions attributable in audit  

---

## Milestone 8 — Billing

### Tasks

1. Plans, seats, usage meters  
2. Stripe adapter  
3. Razorpay adapter  
4. Customer portal hooks  
5. Webhook reconciliation in worker  

### Acceptance criteria

- [ ] Test-mode checkout works per configured provider  
- [ ] Idempotent payment webhooks  
- [ ] Feature flags enforce plan limits  

---

## Milestone 9 — Calendar, tasks, site visits

### Tasks

1. Tasks CRUD + SLA views  
2. Availability + appointments  
3. Site-visit kind for RE template  
4. Reminder jobs  

### Acceptance criteria

- [ ] No double-booking within org calendar rules  
- [ ] Reminders sent via configured channels only  

---

## Milestone 10 — Attribution & dashboards

### Tasks

1. Touchpoint model  
2. Funnel reports  
3. Ad sync jobs (Meta/Google) behind OAuth  
4. Export CSV  

### Acceptance criteria

- [ ] Fixture-based report matches expected numbers  
- [ ] Ad sync clearly blocked without credentials  

---

## Milestone 11 — Hardening & compliance

### Tasks

1. Rate limits, WAF headers, CSRF review  
2. Data export/delete request flows  
3. Penetration-style RLS test suite expansion  
4. Observability (OTEL + error tracking)  
5. Backup/restore drill documentation  

### Acceptance criteria

- [ ] Security checklist signed off with evidence  
- [ ] No critical open RLS findings  

---

## Milestone 12 — Launch readiness

### Tasks

1. Production env runbooks  
2. Load test capture + worker  
3. Status page / health  
4. Vertical templates (RE, education)  
5. Partner API docs published from OpenAPI  

### Acceptance criteria

- [ ] Go/no-go checklist complete with real verification  
- [ ] No milestone marked done with mocks only  

---

## Dependency graph (simplified)

```
M1 → M2 → M3 → M4
           └→ M5 → M6 → M7
      M3 → M9
      M2 → M8
 M3+M5+M6 → M10 → M11 → M12
```
