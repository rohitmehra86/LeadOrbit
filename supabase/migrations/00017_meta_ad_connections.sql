-- Per-org Meta Marketing API connections (OAuth). Platform APP_ID/SECRET stay in env.
-- LeadOrbit project only. Tokens stored encrypted (ciphertext); never select to client.

create table if not exists public.meta_ad_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'connected',
  access_token_ciphertext text not null,
  ad_account_id text not null,
  page_id text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  connected_by_user_id uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create table if not exists public.meta_oauth_pending (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  state_nonce text not null unique,
  access_token_ciphertext text,
  token_expires_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists meta_oauth_pending_org_idx on public.meta_oauth_pending (org_id);
create index if not exists meta_oauth_pending_expires_idx on public.meta_oauth_pending (expires_at);

alter table public.meta_ad_connections enable row level security;
alter table public.meta_oauth_pending enable row level security;

-- Members can read connection metadata; token column must never be exposed via views/API.
create policy meta_ad_connections_member_select on public.meta_ad_connections
  for select using (private.is_org_member(org_id));

-- Writes go through service role / server store (bypass RLS) for ciphertext safety.
-- Keep member insert/update/delete off for anon/authenticated clients.
create policy meta_oauth_pending_member_select on public.meta_oauth_pending
  for select using (private.is_org_member(org_id));
