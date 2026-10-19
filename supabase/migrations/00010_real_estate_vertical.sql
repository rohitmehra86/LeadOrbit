-- Milestone 9: optional real-estate vertical + industry template selection.
-- Not part of core CRM tables.

create table if not exists public.org_vertical_modules (
  org_id uuid not null references public.organizations (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, module_key)
);

create table if not exists public.org_industry_templates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  template_id text not null,
  selected boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, template_id)
);

create table if not exists public.re_developers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  website text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  developer_id uuid not null references public.re_developers (id) on delete cascade,
  name text not null,
  location text not null,
  city text not null,
  status text not null,
  brochure_path text,
  amenities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.re_projects (id) on delete cascade,
  name text not null,
  property_type text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_towers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.re_properties (id) on delete cascade,
  name text not null,
  floors int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.re_floor_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.re_projects (id) on delete cascade,
  name text not null,
  bhk int not null,
  carpet_sqft numeric,
  built_up_sqft numeric,
  bathrooms int,
  created_at timestamptz not null default now()
);

create table if not exists public.re_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.re_projects (id) on delete cascade,
  property_id uuid not null references public.re_properties (id) on delete cascade,
  tower_id uuid,
  floor_plan_id uuid,
  unit_number text not null,
  floor int,
  bhk int not null,
  price numeric,
  currency text not null default 'INR',
  status text not null,
  facing text,
  amenities jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_brokers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  firm text,
  channel_partner boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_buyer_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid,
  budget_min numeric,
  budget_max numeric,
  locations jsonb not null default '[]'::jsonb,
  bhk_min int,
  bhk_max int,
  property_types jsonb not null default '[]'::jsonb,
  must_have_amenities jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_enquiries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid,
  project_id uuid,
  unit_id uuid,
  broker_id uuid,
  assignee_user_id uuid,
  status text not null,
  source text not null,
  message text,
  preference_id uuid,
  site_visit_appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_vertical_modules enable row level security;
alter table public.org_industry_templates enable row level security;
alter table public.re_developers enable row level security;
alter table public.re_projects enable row level security;
alter table public.re_properties enable row level security;
alter table public.re_towers enable row level security;
alter table public.re_floor_plans enable row level security;
alter table public.re_units enable row level security;
alter table public.re_brokers enable row level security;
alter table public.re_buyer_preferences enable row level security;
alter table public.re_enquiries enable row level security;

create policy org_vertical_modules_member on public.org_vertical_modules
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy org_industry_templates_member on public.org_industry_templates
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_developers_member on public.re_developers
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_projects_member on public.re_projects
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_properties_member on public.re_properties
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_towers_member on public.re_towers
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_floor_plans_member on public.re_floor_plans
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_units_member on public.re_units
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_brokers_member on public.re_brokers
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_buyer_preferences_member on public.re_buyer_preferences
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy re_enquiries_member on public.re_enquiries
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
