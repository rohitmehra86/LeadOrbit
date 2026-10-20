# Which Vercel projects to keep

## Keep (LeadOrbit)

| Project | Domain | Action |
|---------|--------|--------|
| **`leadorbit`** | `leadorbit-delta.vercel.app` | **Canonical.** Keep. Root Directory = `apps/web`. Env from `docs/VERCEL_ENV_SETUP.md`. |

## Delete or disconnect (LeadOrbit duplicates)

These all point at `rohitmehra86/LeadOrbit` and create confusion:

| Project | Why remove |
|---------|------------|
| `lead-orbit-xidq` | Duplicate of LeadOrbit |
| `lead-orbit` (`lead-orbit-sigma`) | Duplicate of LeadOrbit |
| `link-books-64ie` | **Wrong repo** — named LinkBooks but linked to LeadOrbit |

In Vercel → Project → Settings → General → **Delete Project**.

## Keep (LinkBooks — separate product)

| Project | Repo | Action |
|---------|------|--------|
| `link-books` | `rohitmehra86/LinkBooks` | Keep if this is the live LinkBooks app |
| `linkbooks` / `link-books-t2fo` | LinkBooks | Delete unused empties after you confirm which URL you use |

Do **not** put LeadOrbit Supabase keys (`kqmuxocbmtydkxdvmypy`) on LinkBooks projects, or LinkBooks keys on LeadOrbit.
