# Migration path: Next.js BFF → Spring Boot

**Status:** Design-only (do not migrate in v1)  
**Goal:** Keep API contracts and domain ports stable so a future Java service can replace TypeScript route handlers without rewriting clients.

---

## 1. What stays

| Asset | Owner today | Future |
|-------|-------------|--------|
| OpenAPI 3.1 under `packages/api-contracts/openapi/` | TS monorepo | Same files published from Java build or shared repo |
| Problem+JSON error shape | `@leadorbit/api-contracts` | Spring `@ControllerAdvice` |
| Idempotency-Key semantics | Route handlers | Filter / interceptor |
| RLS tenancy in Postgres | Supabase | Keep Postgres; Java uses constrained DB role or RLS session vars |
| Worker job names / payloads | `@leadorbit/domain` | Java consumer of same queue schema |

---

## 2. Hexagonal mapping

```
packages/domain          →  Java domain modules (no Spring imports)
packages/db ports        →  Java repository interfaces
packages/db supabase     →  Spring Data / JOOQ adapters
apps/web Route Handlers  →  Spring WebFlux/MVC controllers (or keep Next as BFF)
apps/worker              →  Spring Boot worker / separate JVM service
```

Use-case services should accept ports (interfaces), not Supabase clients.

---

## 3. Suggested Java stack (when approved)

- Java 21+, Spring Boot 3.x  
- Flyway migrations synced from `supabase/migrations` (or generate one way)  
- springdoc-openapi from the same YAML (contract-first)  
- Testcontainers Postgres for repository tests  
- OTel Java agent for parity with Node hooks  

---

## 4. Cutover strategy

1. Freeze OpenAPI minor version (`v1`) and add consumer contract tests.  
2. Implement Java service behind feature flag / path prefix (`/api/v1` via gateway).  
3. Shadow-read: dual-write critical entities; compare checksums.  
4. Shift traffic context-by-context (tenancy → leads → conversations).  
5. Retire TS handlers for migrated contexts; keep Next.js for UI.

---

## 5. Non-goals for now

- Rewriting UI in Java  
- Leaving Supabase Auth without an explicit identity redesign  
- Big-bang rewrite  

---

## 6. Checklist before any Java work starts

- [ ] OpenAPI coverage for all public endpoints  
- [ ] Contract tests in CI  
- [ ] Repository ports free of framework types  
- [ ] Rohit approves ops model (JVM hosting, secrets, CI)
