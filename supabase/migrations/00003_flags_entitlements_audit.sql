-- Feature flags, subscription entitlements, usage quotas, audit trails

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_code text not null default 'free',
  status text not null default 'none'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'none')),
  seats_included int not null default 3 check (seats_included >= 0),
  features jsonb not null default '{}'::jsonb,
  renews_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_quotas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  metric text not null,
  limit_value bigint not null check (limit_value >= 0),
  used_value bigint not null default 0 check (used_value >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  unique (org_id, metric, period_start)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_created_idx
  on public.audit_logs (org_id, created_at desc);

alter table public.feature_flags enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.usage_quotas enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags
  for select using (
    (org_id is null and auth.uid() is not null)
    or (org_id is not null and private.is_org_member(org_id))
  );

drop policy if exists feature_flags_write on public.feature_flags;
create policy feature_flags_write on public.feature_flags
  for all using (
    private.is_platform_admin()
    or (org_id is not null and private.has_org_permission(org_id, 'admin'))
  )
  with check (
    private.is_platform_admin()
    or (org_id is not null and private.has_org_permission(org_id, 'admin'))
  );

drop policy if exists entitlements_select on public.subscription_entitlements;
create policy entitlements_select on public.subscription_entitlements
  for select using (private.is_org_member(org_id));

drop policy if exists entitlements_write on public.subscription_entitlements;
create policy entitlements_write on public.subscription_entitlements
  for all using (private.is_platform_admin() or private.has_org_permission(org_id, 'admin'))
  with check (private.is_platform_admin() or private.has_org_permission(org_id, 'admin'));

drop policy if exists usage_quotas_select on public.usage_quotas;
create policy usage_quotas_select on public.usage_quotas
  for select using (private.is_org_member(org_id));

drop policy if exists usage_quotas_write on public.usage_quotas;
create policy usage_quotas_write on public.usage_quotas
  for all using (private.is_platform_admin() or private.has_org_permission(org_id, 'admin'))
  with check (private.is_platform_admin() or private.has_org_permission(org_id, 'admin'));

-- Audit: members with manager+ can read; inserts via security definer helper only ideally
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (
    private.is_platform_admin()
    or (org_id is not null and private.has_org_permission(org_id, 'manager'))
  );

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert with check (
    actor_user_id = auth.uid()
    and (
      private.is_platform_admin()
      or (org_id is not null and private.is_org_member(org_id))
    )
  );

-- No update/delete policies → immutable audit trail for authenticated roles
