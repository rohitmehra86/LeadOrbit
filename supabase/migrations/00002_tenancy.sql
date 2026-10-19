-- LeadOrbit tenancy stub (Milestone 1 schema draft; RLS verified in Milestone 2).
-- DO NOT treat as production-applied until linked Supabase project confirms.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  org_type text not null check (org_type in ('agency', 'workspace')),
  parent_org_id uuid references public.organizations (id),
  billing_country char(2),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_id_idx on public.memberships (user_id);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

-- Policies are intentionally minimal stubs; expand + test in Milestone 2.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy memberships_select_own on public.memberships
  for select using (user_id = auth.uid());

create policy organizations_select_member on public.organizations
  for select using (
    id in (
      select m.org_id from public.memberships m
      where m.user_id = auth.uid() and m.status = 'active'
    )
  );
