# LeadOrbit — Database Design

**Engine:** PostgreSQL (Supabase)  
**Extensions (planned):** `pgcrypto`, `uuid-ossp` or `pgcrypto.gen_random_uuid()`, `vector` (pgvector)  
**Isolation model:** Shared DB, shared schema, **row-level security by `org_id`**

Milestone 1 ships the design + initial SQL migration stubs. Full RLS verification is Milestone 2+.

---

## 1. Conventions

| Convention | Rule |
|------------|------|
| Primary keys | `uuid` default `gen_random_uuid()` |
| Tenancy | `org_id uuid not null` on all tenant data |
| Timestamps | `created_at`, `updated_at` timestamptz |
| Soft delete | `deleted_at` where audit retention needed |
| Money | `numeric(18,2)` + `currency char(3)` |
| Enums | Postgres enums or check constraints; mirrored in `packages/domain` |
| Naming | `snake_case` tables/columns |
| Auth link | `profiles.id` = `auth.users.id` |

---

## 2. ER overview (core)

```
auth.users ──1:1── profiles
       │
       └── memberships ──*── organizations ──┬── leads ── activities
                                             ├── contacts
                                             ├── companies
                                             ├── pipelines ── stages ── opportunities
                                             ├── threads ── messages
                                             ├── workflows ── enrollments
                                             ├── tasks / appointments
                                             ├── invoices / payments
                                             ├── api_keys
                                             └── embeddings
```

Agency hierarchy: `organizations.parent_org_id` nullable self-FK.

---

## 3. Core tables

### 3.1 `profiles`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = auth.users.id |
| email | text | |
| full_name | text | |
| avatar_url | text | |
| created_at / updated_at | timestamptz | |

### 3.2 `organizations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| slug | text unique | |
| org_type | text | `agency` \| `workspace` |
| parent_org_id | uuid null FK | Agency parent |
| billing_country | char(2) | Drives payment rail preference |
| settings | jsonb | Branding, defaults |
| created_at / updated_at | timestamptz | |

### 3.3 `memberships`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| user_id | uuid FK | |
| role | text | `owner`\|`admin`\|`manager`\|`agent`\|`viewer` |
| status | text | `active`\|`invited`\|`disabled` |
| unique(org_id, user_id) | | |

### 3.4 `invites`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid | |
| email | text | |
| role | text | |
| token_hash | text | |
| expires_at | timestamptz | |

### 3.5 `leads`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid | |
| email / phone | text null | Normalized unique partial indexes per org |
| full_name | text | |
| source | text | form, ads, import, api, whatsapp… |
| lifecycle_stage | text | subscriber→evangelist set |
| status | text | open/qualified/converted/archived |
| score | int | 0–100 |
| owner_user_id | uuid null | |
| company_id | uuid null | |
| utm | jsonb | |
| custom_fields | jsonb | |
| idempotency_key | text null | unique(org_id, idempotency_key) |
| converted_contact_id | uuid null | |
| created_at / updated_at / deleted_at | | |

### 3.6 `contacts` / `companies`

Standard CRM person/org entities with `org_id`, owner, tags via join tables.

### 3.7 `pipelines` / `pipeline_stages` / `opportunities`

- Pipeline belongs to org; stages ordered by `position`.  
- Opportunity links `lead_id`/`contact_id`, `amount`, `currency`, `stage_id`, `probability`, `expected_close_date`.

### 3.8 `activities`

Append-mostly timeline:

| Column | Type |
|--------|------|
| id, org_id, actor_user_id | uuid |
| entity_type / entity_id | text / uuid |
| activity_type | text |
| payload | jsonb |
| created_at | timestamptz |

Index `(org_id, entity_type, entity_id, created_at desc)`.

### 3.9 `threads` / `messages`

- Thread: channel, subject, lead/contact FK, assignee, status.  
- Message: direction, body/text, provider_message_id, metadata, sent_at.

### 3.10 `workflows` / `workflow_enrollments` / `jobs`

- Workflow: `definition jsonb` (DSL), status.  
- Enrollment: entity ref, state pointer, status.  
- Jobs: queue rows if using pg-boss schema or app-level `job_outbox`.

### 3.11 `tasks` / `appointments`

Tasks: due_at, priority, status, entity links.  
Appointments: start/end tz, kind (`meeting`|`site_visit`), location/geo optional.

### 3.12 `invoices` / `payment_intents`

Provider-agnostic: `provider` (`stripe`|`razorpay`), external ids, status, amounts.

### 3.13 `api_keys`

`org_id`, `name`, `key_prefix`, `key_hash`, `scopes[]`, `last_used_at`, `revoked_at`.

### 3.14 `embeddings`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| org_id | uuid | |
| entity_type / entity_id | text / uuid | |
| content_hash | text | |
| embedding | vector(1536) | Dimension TBD per model |
| metadata | jsonb | |

IVFFlat/HNSW index; **RLS mandatory**.

### 3.15 `audit_logs`

Privileged actions; insert-only for members; select admin+.

---

## 4. RLS policy pattern

```sql
-- Example pattern (illustrative)
create policy leads_select on public.leads
  for select using (
    org_id in (
      select m.org_id from public.memberships m
      where m.user_id = auth.uid() and m.status = 'active'
    )
  );
```

Service role bypasses RLS — workers must still constrain by `org_id` in application code and tests.

Public form inserts go through a **security definer** function or edge path that validates form tokens and sets `org_id` server-side.

---

## 5. Indexing strategy

- Hot paths: `(org_id, updated_at desc)`, `(org_id, owner_user_id)`, phone/email normalized.  
- Idempotency unique constraints.  
- Partial indexes where `deleted_at is null`.  
- BRIN on `activities.created_at` if volume warrants (later).

---

## 6. Migration plan

| Migration | Milestone | Contents |
|-----------|-----------|----------|
| `00001_extensions.sql` | M1 | pgcrypto, vector |
| `00002_tenancy.sql` | M2 | profiles, orgs, memberships, invites, platform_admins, RLS helpers |
| `00003_flags_entitlements_audit.sql` | M2 | feature_flags, entitlements, usage_quotas, audit_logs + RLS |
| `00004_crm_core.sql` | M3 | leads, contacts, companies, tags, activities |

| `00004_pipeline.sql` | M4 | pipelines, opps |
| `00005_conversations.sql` | M5 | threads, messages |
| `00006_automation.sql` | M6 | workflows, jobs |
| `00007_ai.sql` | M7 | embeddings, ai_runs |
| `00008_billing.sql` | M8 | invoices, payments |
| `00009_rls_hardening.sql` | M2–M8 incremental | policies + tests |

---

## 7. Seed data (dev)

- Two orgs (agency + workspace), three users with distinct roles.  
- Sample pipeline + 25 leads with UTMs.  
- Used for RLS negative tests (user A cannot select org B).

---

## 8. Backup & retention

- Supabase PITR when on paid plan (Rohit to enable).  
- Soft-deleted PII retained per tenant policy; hard-delete job for GDPR/DPDP requests.  
- Activity/audit retention configurable (default 24 months).

---

## 9. Future Spring Boot mapping

Tables map 1:1 to JPA/Flyway entities later; API contracts remain source of truth for external shape. Avoid DB-specific features in domain code beyond pgvector (isolated behind repository).
