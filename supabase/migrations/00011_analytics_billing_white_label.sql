-- Milestone 10: analytics events, billing, white-label

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null,
  channel text,
  campaign_id uuid,
  entity_type text,
  entity_id uuid,
  actor_user_id uuid,
  amount numeric,
  currency text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_org_idx
  on public.analytics_events (org_id, occurred_at desc);

create table if not exists public.scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  recipients jsonb not null default '[]'::jsonb,
  status text not null default 'scaffolded',
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  interval text not null check (interval in ('monthly', 'annual')),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'USD',
  seats_included int not null default 1,
  ai_credits_included int not null default 0,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table if not exists public.org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_code text not null,
  status text not null
    check (status in ('trialing', 'active', 'past_due', 'grace', 'canceled', 'incomplete', 'none')),
  interval text not null check (interval in ('monthly', 'annual')),
  seats_included int not null default 1,
  seats_used int not null default 0,
  ai_credits_included int not null default 0,
  ai_credits_used int not null default 0,
  usage_quotas jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  trial_ends_at timestamptz,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  grace_ends_at timestamptz,
  provider text not null check (provider in ('stripe', 'razorpay', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid references public.org_subscriptions (id) on delete set null,
  number text not null,
  status text not null,
  amount_cents int not null,
  currency text not null default 'USD',
  provider text not null,
  provider_invoice_id text,
  hosted_invoice_url text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists billing_invoices_org_idx
  on public.billing_invoices (org_id, created_at desc);

-- Idempotency key: (provider, event_id)
create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'razorpay', 'manual')),
  event_id text not null,
  event_type text not null,
  org_id uuid references public.organizations (id) on delete set null,
  processed boolean not null default false,
  detail text not null default '',
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table if not exists public.white_label_brands (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  logo_url text,
  primary_color text,
  accent_color text,
  support_email text,
  login_headline text,
  email_from_name text,
  email_footer text,
  hide_leadorbit_branding boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  hostname text not null,
  status text not null,
  txt_challenge text,
  detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, hostname)
);

create table if not exists public.agency_managed_orgs (
  id uuid primary key default gen_random_uuid(),
  agency_org_id uuid not null references public.organizations (id) on delete cascade,
  child_org_id uuid not null references public.organizations (id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  unique (agency_org_id, child_org_id)
);

alter table public.analytics_events enable row level security;
alter table public.scheduled_reports enable row level security;
alter table public.billing_plans enable row level security;
alter table public.org_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.white_label_brands enable row level security;
alter table public.custom_domains enable row level security;
alter table public.agency_managed_orgs enable row level security;

drop policy if exists analytics_events_select on public.analytics_events;
create policy analytics_events_select on public.analytics_events
  for select using (private.is_org_member(org_id));

drop policy if exists analytics_events_write on public.analytics_events;
create policy analytics_events_write on public.analytics_events
  for all using (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'manager')
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'manager')
  );

drop policy if exists scheduled_reports_all on public.scheduled_reports;
create policy scheduled_reports_all on public.scheduled_reports
  for all using (
    private.is_platform_admin()
    or private.is_org_member(org_id)
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'manager')
  );

drop policy if exists billing_plans_select on public.billing_plans;
create policy billing_plans_select on public.billing_plans
  for select using (auth.uid() is not null);

drop policy if exists org_subscriptions_select on public.org_subscriptions;
create policy org_subscriptions_select on public.org_subscriptions
  for select using (private.is_org_member(org_id));

drop policy if exists org_subscriptions_write on public.org_subscriptions;
create policy org_subscriptions_write on public.org_subscriptions
  for all using (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'admin')
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'admin')
  );

drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select on public.billing_invoices
  for select using (private.is_org_member(org_id));

drop policy if exists billing_invoices_write on public.billing_invoices;
create policy billing_invoices_write on public.billing_invoices
  for all using (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'admin')
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'admin')
  );

-- Webhook events: service role / platform admin only
drop policy if exists billing_webhook_events_admin on public.billing_webhook_events;
create policy billing_webhook_events_admin on public.billing_webhook_events
  for all using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists white_label_brands_all on public.white_label_brands;
create policy white_label_brands_all on public.white_label_brands
  for all using (
    private.is_platform_admin()
    or private.is_org_member(org_id)
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'admin')
  );

drop policy if exists custom_domains_all on public.custom_domains;
create policy custom_domains_all on public.custom_domains
  for all using (
    private.is_platform_admin()
    or private.is_org_member(org_id)
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(org_id, 'admin')
  );

drop policy if exists agency_managed_orgs_all on public.agency_managed_orgs;
create policy agency_managed_orgs_all on public.agency_managed_orgs
  for all using (
    private.is_platform_admin()
    or private.is_org_member(agency_org_id)
  )
  with check (
    private.is_platform_admin()
    or private.has_org_permission(agency_org_id, 'admin')
  );
