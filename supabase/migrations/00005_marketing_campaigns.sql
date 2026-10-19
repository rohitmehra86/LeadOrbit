-- Milestone 4 marketing: campaigns, forms, landing pages, funnels, events, ad integrations.
-- Local runtime uses node:sqlite with equivalent schema. Apply when Supabase is linked.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  objective text not null,
  status text not null,
  audience jsonb not null default '{}'::jsonb,
  ad_copy text not null default '',
  landing_page_id uuid,
  form_id uuid,
  utm jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  schedule_start timestamptz,
  schedule_end timestamptz,
  template_key text,
  ab_test_enabled boolean not null default false,
  ab_variants jsonb not null default '[]'::jsonb,
  attribution_model text not null default 'last_touch',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  content_type text not null,
  storage_path text not null,
  width int,
  height int,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  name text not null,
  status text not null,
  fields jsonb not null default '[]'::jsonb,
  multi_step boolean not null default true,
  spam_honeypot_enabled boolean not null default true,
  duplicate_detection boolean not null default true,
  consent_text text,
  webhook_url text,
  embed_enabled boolean not null default true,
  version int not null default 1,
  template_key text,
  thank_you_message text not null default 'Thank you',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  version int not null,
  fields jsonb not null,
  created_at timestamptz not null default now(),
  note text
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  lead_id uuid,
  payload jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  duplicate_of_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  form_id uuid references public.forms (id) on delete set null,
  name text not null,
  slug text not null,
  status text not null,
  document jsonb not null,
  template_key text,
  version int not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table if not exists public.page_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  page_id uuid not null references public.landing_pages (id) on delete cascade,
  version int not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  note text
);

create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  name text not null,
  status text not null,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid,
  page_id uuid,
  form_id uuid,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  network text not null,
  status text not null,
  external_account_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, network)
);

alter table public.campaigns enable row level security;
alter table public.creative_assets enable row level security;
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.landing_pages enable row level security;
alter table public.page_versions enable row level security;
alter table public.funnels enable row level security;
alter table public.marketing_events enable row level security;
alter table public.ad_integrations enable row level security;

-- Membership-gated policies (mirrors tenancy helper private.is_org_member).
create policy campaigns_member_all on public.campaigns
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy creatives_member_all on public.creative_assets
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy forms_member_all on public.forms
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy form_versions_member_all on public.form_versions
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy form_submissions_member_all on public.form_submissions
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy landing_pages_member_all on public.landing_pages
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy page_versions_member_all on public.page_versions
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy funnels_member_all on public.funnels
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy marketing_events_member_all on public.marketing_events
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ad_integrations_member_all on public.ad_integrations
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
