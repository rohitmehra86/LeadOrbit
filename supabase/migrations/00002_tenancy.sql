-- LeadOrbit Milestone 2: tenancy, memberships, invites, branding/settings, RLS
-- Apply via Supabase CLI against linked project. Not applied in this agent VM (no Docker/CLI project).

create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
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
  timezone text not null default 'UTC',
  locale text not null default 'en-US',
  currency char(3) not null default 'USD',
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  billing_country char(2),
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
create index if not exists memberships_org_id_idx on public.memberships (org_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'agent', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null,
  invited_by_user_id uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (org_id, email, status)
);

create index if not exists invites_org_id_idx on public.invites (org_id);

-- Platform super-admins (LeadOrbit operators). Never grant via client self-serve.
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) or private.is_platform_admin();
$$;

create or replace function private.has_org_permission(target_org uuid, min_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.org_id = target_org
        and m.user_id = auth.uid()
        and m.status = 'active'
        and (
          case m.role
            when 'owner' then 5
            when 'admin' then 4
            when 'manager' then 3
            when 'agent' then 2
            when 'viewer' then 1
            else 0
          end
        ) >= (
          case min_role
            when 'owner' then 5
            when 'admin' then 4
            when 'manager' then 3
            when 'agent' then 2
            when 'viewer' then 1
            else 99
          end
        )
    );
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.platform_admins enable row level security;

-- Profiles
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or private.is_platform_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

-- Organizations
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
  for select using (private.is_org_member(id));

drop policy if exists organizations_insert_authenticated on public.organizations;
create policy organizations_insert_authenticated on public.organizations
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
  for update using (private.has_org_permission(id, 'admin'))
  with check (private.has_org_permission(id, 'admin'));

-- Memberships
drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships
  for select using (private.is_org_member(org_id));

drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin on public.memberships
  for insert with check (private.has_org_permission(org_id, 'admin'));

drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin on public.memberships
  for update using (private.has_org_permission(org_id, 'admin'))
  with check (private.has_org_permission(org_id, 'admin'));

-- Invites
drop policy if exists invites_select_manager on public.invites;
create policy invites_select_manager on public.invites
  for select using (private.has_org_permission(org_id, 'manager'));

drop policy if exists invites_insert_manager on public.invites;
create policy invites_insert_manager on public.invites
  for insert with check (private.has_org_permission(org_id, 'manager'));

drop policy if exists invites_update_manager on public.invites;
create policy invites_update_manager on public.invites
  for update using (private.has_org_permission(org_id, 'manager'))
  with check (private.has_org_permission(org_id, 'manager'));

-- Platform admins: only existing platform admins can read/manage
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select using (private.is_platform_admin());

drop policy if exists platform_admins_insert on public.platform_admins;
create policy platform_admins_insert on public.platform_admins
  for insert with check (private.is_platform_admin());

revoke all on function private.is_platform_admin() from public;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_permission(uuid, text) from public;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid, text) to authenticated;
