-- Milestone 8: appointments, calendar connections, voice/calling.
-- Local runtime uses node:sqlite equivalent schema in packages/db.

create table if not exists public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  kind text not null,
  duration_minutes int not null,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 0,
  timezone text not null default 'UTC',
  requires_site_visit boolean not null default false,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_availability (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  weekday int not null,
  start_time text not null,
  end_time text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table if not exists public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null,
  title text not null,
  appointment_type_id uuid not null references public.appointment_types (id) on delete cascade,
  timezone text not null default 'UTC',
  assigned_user_ids jsonb not null default '[]'::jsonb,
  public boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  appointment_type_id uuid not null references public.appointment_types (id),
  booking_page_id uuid,
  lead_id uuid,
  assignee_user_id uuid,
  status text not null,
  kind text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 0,
  blocked_start timestamptz not null,
  blocked_end timestamptz not null,
  location text,
  site_visit_address text,
  notes text,
  reminder_job_id text,
  external_calendar_event_id text,
  calendar_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_org_assignee_blocked_idx
  on public.appointments (org_id, assignee_user_id, blocked_start, blocked_end);

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  status text not null,
  account_email text,
  detail text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

create table if not exists public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  channel text not null,
  scheduled_at timestamptz not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  status text not null,
  from_number text,
  detail text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  direction text not null,
  status text not null,
  from_number text not null,
  to_number text not null,
  lead_id uuid,
  assignee_user_id uuid,
  appointment_id uuid,
  recording_consent boolean not null default false,
  recording_url text,
  transcript_status text not null default 'pending',
  transcript_text text,
  summary text,
  outcome text not null default 'unknown',
  ai_assisted boolean not null default false,
  duration_seconds int,
  cost_usd numeric,
  legal_outbound_allowed boolean not null default false,
  detail text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_voice_policies (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  legal_outbound_allowed boolean not null default false,
  require_recording_consent boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.appointment_types enable row level security;
alter table public.team_availability enable row level security;
alter table public.booking_pages enable row level security;
alter table public.appointments enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.appointment_reminders enable row level security;
alter table public.voice_connections enable row level security;
alter table public.voice_calls enable row level security;
alter table public.org_voice_policies enable row level security;

create policy appointment_types_member on public.appointment_types
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy team_availability_member on public.team_availability
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy booking_pages_member on public.booking_pages
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy appointments_member on public.appointments
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy calendar_connections_member on public.calendar_connections
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy appointment_reminders_member on public.appointment_reminders
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy voice_connections_member on public.voice_connections
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy voice_calls_member on public.voice_calls
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy org_voice_policies_member on public.org_voice_policies
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
