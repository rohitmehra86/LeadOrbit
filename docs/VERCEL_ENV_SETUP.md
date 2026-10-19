# LeadOrbit — Vercel env setup (UI)

Agent cannot call Vercel API from this environment (egress). Set these in **Vercel → Project `leadorbit` → Settings → Environment Variables** for **Production** and **Preview**.

## Required project settings first

1. **Root Directory** = `apps/web` (not `./`)
2. Redeploy after saving Root Directory + env vars

## Environment variables

| Name | Value |
|------|--------|
| `AUTH_MODE` | `supabase` |
| `LEADORBIT_ENV` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kqmuxocbmtydkxdvmypy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project **LeadOrbit** → Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → `service_role` **secret** (never expose to browser) |
| `SESSION_SECRET` | Generate: `openssl rand -base64 48` (or ask agent — stored agent-local) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://leadorbit.vercel.app` (update after first Ready deploy) |
| `CSRF_STRICT` | `1` |
| `CSRF_ALLOWED_ORIGINS` | same as `NEXT_PUBLIC_APP_URL` |

Do **not** paste Linkbook project keys. Supabase project ref for LeadOrbit: `kqmuxocbmtydkxdvmypy`.

## After env is set

Deployments → Redeploy latest `main`. Paste the Ready URL back to the agent.
