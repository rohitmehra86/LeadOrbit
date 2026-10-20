# Demo accounts (Vercel / Supabase)

**App:** https://leadorbit-delta.vercel.app  
**Database:** LeadOrbit Supabase `kqmuxocbmtydkxdvmypy` (never Linkbook).

## Pre-seeded friend accounts

Same password for both: `DemoFriend-Vercel-2026!`

| Friend | Email | Org | Deep links |
|--------|-------|-----|------------|
| Marketing | `marketing.friend@test.com` | Marketing Friend Agency | [Login](https://leadorbit-delta.vercel.app/login) · [Marketing](https://leadorbit-delta.vercel.app/app/orgs/33333333-3333-4333-8333-333333333333/marketing) · [Public page](https://leadorbit-delta.vercel.app/p/33333333-3333-4333-8333-333333333333/launch-friend-demo) |
| Broker | `broker.friend@test.com` | Broker Friend Realty | [Login](https://leadorbit-delta.vercel.app/login) · [Real estate](https://leadorbit-delta.vercel.app/app/orgs/44444444-4444-4444-8444-444444444444/real-estate) |

Orgs are **independent** — friends do not see each other’s leads.

## Prefer friends create their own?

[Signup](https://leadorbit-delta.vercel.app/signup) → new email → create workspace. That also creates an isolated org.

## Reset / re-seed

Re-run the durable seed SQL in Supabase SQL editor (LeadOrbit project), or ask the agent to re-apply `scripts/seed-vercel-demo-orgs.sql`. Fixed org IDs above are replaced on re-seed.

## Seeing the old UI?

Hard-refresh or use **incognito**. If still old, Redeploy Production from GitHub `main` (`736b12e`+ pro UI). Forwardable card: [`FRIEND_ACCESS.md`](./FRIEND_ACCESS.md).

## Vercel env checklist (Rohit)

Production project **leadorbit** (`leadorbit-delta.vercel.app`), Root Directory = `apps/web`:

| Variable | Value |
|----------|--------|
| `AUTH_MODE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kqmuxocbmtydkxdvmypy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | LeadOrbit anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | LeadOrbit **service_role** (server only; required for smooth signup) |
| `NEXT_PUBLIC_APP_URL` | `https://leadorbit-delta.vercel.app` |
| `CSRF_ALLOWED_ORIGINS` | `https://leadorbit-delta.vercel.app` |
| `CSRF_STRICT` | `1` |
| `SESSION_SECRET` | long random string |

After changes: **Redeploy** `main`. Confirm [health](https://leadorbit-delta.vercel.app/api/v1/health) shows `"authMode":"supabase"`.
