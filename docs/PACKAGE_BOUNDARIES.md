# Package boundaries

Dependency direction (left may import right; never reverse):

```
apps/web        → domain, api-contracts, ui, db (server-only), config
apps/worker     → domain, api-contracts, db, config
packages/db     → domain, api-contracts
packages/sdk    → api-contracts          (future)
packages/ui     → (React only; no domain I/O)
packages/domain → (nothing in this monorepo)
packages/api-contracts → (nothing; pure DTOs)
packages/config → (nothing)
```

Rules:

1. `domain` has zero I/O (no fetch, no supabase, no fs).  
2. Apps never import other apps.  
3. UI packages must not import `db`.  
4. New shared code needs a home in an existing package or a new package with a one-paragraph rationale in an ADR.
