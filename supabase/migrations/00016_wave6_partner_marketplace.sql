-- Wave 6: partner outbound/inbound webhooks + marketplace installs
-- App path today uses SQLite PartnerWebhookStore / MarketplaceStore.
-- These tables mirror for future AUTH_MODE=supabase adapters.

create table if not exists partner_outbound_subscriptions (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  target_url text not null,
  secret text not null,
  event_types jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_outbound_subs_org_idx
  on partner_outbound_subscriptions(org_id);

create table if not exists partner_outbound_deliveries (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid not null references partner_outbound_subscriptions(id) on delete cascade,
  event_type text not null,
  event_id text not null,
  status text not null,
  attempt_count int not null default 0,
  next_retry_at timestamptz,
  last_status_code int,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, subscription_id, event_id)
);
create index if not exists partner_outbound_del_org_idx
  on partner_outbound_deliveries(org_id, status);

create table if not exists partner_inbound_secrets (
  org_id uuid primary key references organizations(id) on delete cascade,
  secret text not null,
  updated_at timestamptz not null default now()
);

create table if not exists partner_inbound_events (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  partner text not null,
  event_id text not null,
  event_type text not null,
  status text not null,
  detail text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, partner, event_id)
);
create index if not exists partner_inbound_org_idx
  on partner_inbound_events(org_id, created_at);

create table if not exists marketplace_installs (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  pack_id text not null,
  pack_slug text not null,
  campaign_id uuid,
  form_id uuid,
  page_id uuid,
  page_slug text,
  detail text not null,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_installs_org_idx
  on marketplace_installs(org_id, created_at);

alter table partner_outbound_subscriptions enable row level security;
alter table partner_outbound_deliveries enable row level security;
alter table partner_inbound_secrets enable row level security;
alter table partner_inbound_events enable row level security;
alter table marketplace_installs enable row level security;

-- Member read; integrations:write roles can manage via service role / future RPCs.
create policy partner_outbound_subs_select on partner_outbound_subscriptions
  for select using (private.is_org_member(org_id));
create policy partner_outbound_del_select on partner_outbound_deliveries
  for select using (private.is_org_member(org_id));
create policy partner_inbound_events_select on partner_inbound_events
  for select using (private.is_org_member(org_id));
create policy marketplace_installs_select on marketplace_installs
  for select using (private.is_org_member(org_id));
