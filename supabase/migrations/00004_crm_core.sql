-- Milestone 3 CRM core (Postgres / Supabase). Local runtime uses node:sqlite with equivalent schema.
-- Apply when a Supabase project is linked. RLS patterns mirror tenancy helpers from 00002.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  domain text,
  industry text,
  owner_user_id uuid references public.profiles (id),
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid references public.companies (id),
  email text,
  phone text,
  full_name text not null,
  title text,
  owner_user_id uuid references public.profiles (id),
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('lead', 'deal')),
  is_default boolean not null default false
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  position int not null,
  probability int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text,
  phone text,
  full_name text not null,
  company_id uuid references public.companies (id),
  contact_id uuid references public.contacts (id),
  source text not null,
  status text not null,
  lifecycle_stage text not null,
  score int not null default 0,
  owner_user_id uuid references public.profiles (id),
  territory text,
  pipeline_id uuid references public.pipelines (id),
  stage_id uuid references public.pipeline_stages (id),
  idempotency_key text,
  custom_fields jsonb not null default '{}'::jsonb,
  sla_due_at timestamptz,
  sla_state text not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  pipeline_id uuid not null references public.pipelines (id),
  stage_id uuid not null references public.pipeline_stages (id),
  lead_id uuid references public.leads (id),
  contact_id uuid references public.contacts (id),
  company_id uuid references public.companies (id),
  amount numeric(18,2) not null default 0,
  currency char(3) not null default 'USD',
  status text not null,
  owner_user_id uuid references public.profiles (id),
  expected_close_date date,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  description text,
  status text not null,
  due_at timestamptz,
  owner_user_id uuid references public.profiles (id),
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  body text not null,
  author_user_id uuid not null references public.profiles (id),
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references public.profiles (id),
  entity_type text not null,
  entity_id uuid not null,
  activity_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ownership_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  from_user_id uuid,
  to_user_id uuid,
  reason text not null,
  changed_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.notes enable row level security;
alter table public.crm_activities enable row level security;
alter table public.ownership_history enable row level security;

create policy companies_member on public.companies
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

create policy contacts_member on public.contacts
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

create policy leads_member on public.leads
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

create policy opportunities_member on public.opportunities
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

create policy pipelines_member on public.pipelines
  for select using (private.is_org_member(org_id));

create policy stages_member on public.pipeline_stages
  for select using (private.is_org_member(org_id));

create policy tasks_member on public.crm_tasks
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

create policy notes_member on public.notes
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

create policy activities_member on public.crm_activities
  for select using (private.is_org_member(org_id));

create policy ownership_member on public.ownership_history
  for select using (private.is_org_member(org_id));
