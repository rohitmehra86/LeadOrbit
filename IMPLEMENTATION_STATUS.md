# LeadOrbit — Implementation Status

**Last updated:** 2026-10-19  
**Current milestone focus:** Milestone 2 (Auth & multi-tenancy)  
**Honesty policy:** Status reflects verified reality only.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Implemented/verified** | Code exists and was exercised (build/test/manual) in this environment |
| **Unverified** | Code or docs exist but not fully exercised |
| **Blocked** | Cannot proceed without credential/approval/tooling |
| **Not implemented** | Not started |

---

## Milestone 1 — Foundation

| Item | Status |
|------|--------|
| Docs, monorepo, CI, OpenAPI stub, web scaffold | Implemented/verified |

---

## Milestone 2 — Auth & multi-tenancy

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Permission model (Owner→Viewer + fine-grained keys) | Implemented/verified | Unit tests in `@leadorbit/domain` |
| Local auth (signup/login/logout/session JWT cookie) | Implemented/verified | HTTP smoke: signup → session |
| Organizations + multi-org membership | Implemented/verified | Create org API + `/app` UI |
| Invites create/accept | Implemented/verified | HTTP: invite → accept → 200 on org |
| Cross-tenant denial (service/API) | Implemented/verified | HTTP: non-member GET org → **403**; unit tests |
| Org settings + branding fields | Implemented/verified | PATCH + settings form |
| Feature flags + entitlements/quotas scaffolding | Implemented/verified | Local store + APIs |
| Audit trail | Implemented/verified | Local append + manager+ read |
| Super-admin portal skeleton | Implemented/verified | `/platform`; first local user bootstrapped |
| Supabase Auth SSR + middleware | Implemented/verified (code only) | Not live-tested — no credentials |
| Supabase tenancy repos on live DB | **Blocked** | No project; MCP auth timed out |
| RLS SQL migrations | Implemented/verified (static) | `00002`, `00003` + contract tests |
| Postgres RLS isolation | **Blocked / not verified** | No Docker/Postgres/Supabase project |
| `pnpm typecheck` / `lint` / `test` | Implemented/verified | Pass after M2 |
| Web on :43127 | Implemented/verified | health `authMode: local` |
| Draft PR on proper remote | **Blocked** | `agent_temp` remote; invalid `gh` token |

---

## Milestones 3–12

Not implemented.

---

## Blockers for Rohit

1. **Supabase** project URL + anon key + service role (apply migrations; verify RLS)  
2. **GitHub** valid auth for private repo + PR  
3. **Vercel** project (deploy)  
4. Optional: Docker for `supabase start`

Do not paste secrets into chat.

---

## Known issues

1. Local store is in-memory (resets on server restart) — not production.  
2. `AUTH_MODE=supabase` session clients exist; tenancy **mutations** still require DB adapters after migrations are applied.  
3. First local signup becomes platform admin (dev-only).  
4. **Do not claim production multi-tenant isolation** until Postgres RLS tests pass on a real project.
