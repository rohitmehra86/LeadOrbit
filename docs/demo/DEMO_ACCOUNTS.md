# Demo accounts & sample data

## Preferred setup (friends don’t collide)

Each friend **signs up with their own email** on local LeadOrbit. That creates a separate org automatically — no shared data.

| Friend | Suggested org name | Mode |
|--------|-------------------|------|
| Marketing expert | Their agency name | Simple |
| Real estate broker | Their brokerage name | Advanced (to see Real estate) |

## Pre-seeded orgs (local only)

With the app running (`pnpm local:demo` or web on :43127):

```bash
pnpm demo:seed
```

Creates **two independent orgs** and writes credentials to:

```
.data/demo-seed.json
```

| Org | Purpose |
|-----|---------|
| **Marketing Demo Agency** | Launch Pack published + sample leads + one public form submit |
| **Demo Realty Brokers** | RE enabled, project/units, buyer prefs, enquiry, site visit |

Passwords are printed once in the terminal and stored in `.data/demo-seed.json` (gitignored). Re-run `pnpm demo:seed` anytime for fresh emails/orgs (in-memory tenancy resets when the server restarts — seed again after restart).

Smoke check:

```bash
pnpm demo:smoke
```

## Reset

1. Stop the local server (Ctrl+C).  
2. Optional: delete `.data/leadorbit.sqlite` and `.data/demo-seed.json`.  
3. Start again: `pnpm local:demo`.  
4. `pnpm demo:seed` (or friends use `/signup`).

**Note:** `AUTH_MODE=local` keeps users/orgs in process memory. A server restart clears tenancy — always re-seed or re-signup after restart.

## Vercel (https://leadorbit-delta.vercel.app)

- Uses Supabase when configured.  
- **Do not promise** friend demos on Vercel until signup/login is verified for that deploy.  
- If signup fails or is slow, fall back to local `pnpm local:demo` + `pnpm demo:seed`.
