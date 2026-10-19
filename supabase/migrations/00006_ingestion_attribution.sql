-- Milestone 5: lead ingestion, webhooks, attribution, channel adapters.
-- Local runtime uses node:sqlite equivalent schema. Apply when Supabase is linked.

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  secret text not null,
  enabled boolean not null default true,
  channel text not null default 'webhook',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  endpoint_id uuid references public.webhook_endpoints (id) on delete set null,
  direction text not null,
  target_url text,
  status text not null,
  attempt_count int not null default 0,
  next_retry_at timestamptz,
  last_status_code int,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingestion_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null,
  status text not null,
  idempotency_key text,
  external_event_id text,
  lead_id uuid,
  campaign_id uuid,
  form_id uuid,
  page_id uuid,
  fingerprint text,
  duplicate_of_event_id uuid,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists public.attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid,
  opportunity_id uuid,
  campaign_id uuid,
  channel text not null,
  utm jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.channel_adapters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  status text not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, channel)
);

create table if not exists public.lead_attribution (
  lead_id uuid not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  model text not null,
  campaign_id uuid,
  opportunity_id uuid,
  weight_by_campaign jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (lead_id, org_id)
);

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.ingestion_events enable row level security;
alter table public.attribution_touchpoints enable row level security;
alter table public.channel_adapters enable row level security;
alter table public.lead_attribution enable row level security;

create policy webhook_endpoints_member_all on public.webhook_endpoints
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy webhook_deliveries_member_all on public.webhook_deliveries
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ingestion_events_member_all on public.ingestion_events
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy attribution_touchpoints_member_all on public.attribution_touchpoints
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy channel_adapters_member_all on public.channel_adapters
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy lead_attribution_member_all on public.lead_attribution
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
