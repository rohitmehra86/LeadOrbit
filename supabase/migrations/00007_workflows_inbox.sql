-- Milestone 6: durable jobs, workflows, unified inbox.
-- Local runtime uses node:sqlite equivalent schema.

create table if not exists public.durable_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null,
  status text not null,
  attempts int not null default 0,
  run_at timestamptz not null,
  locked_at timestamptz,
  idempotency_key text unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  status text not null,
  graph jsonb not null,
  version int not null default 1,
  test_mode boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  version int not null,
  graph jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  workflow_version int not null,
  lead_id uuid,
  conversation_id uuid,
  status text not null,
  current_node_id text,
  context jsonb not null default '{}'::jsonb,
  idempotency_key text,
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  enrollment_id uuid not null references public.workflow_enrollments (id) on delete cascade,
  node_id text not null,
  attempt int not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  workflow_id uuid,
  enrollment_id uuid,
  action text not null,
  actor_user_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null,
  subject text,
  status text not null,
  assignee_user_id uuid,
  lead_id uuid,
  contact_address text,
  unread_count int not null default 0,
  tags jsonb not null default '[]'::jsonb,
  sla_due_at timestamptz,
  last_message_at timestamptz,
  consent_ok boolean not null default true,
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null,
  channel text not null,
  body text not null,
  html_body text,
  template_key text,
  attachment_paths jsonb not null default '[]'::jsonb,
  delivery_status text not null,
  provider_message_id text,
  sender_user_id uuid,
  is_internal_note boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null,
  key text not null,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (org_id, channel, key)
);

create table if not exists public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null,
  status text not null,
  webhook_secret text,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, channel)
);

create table if not exists public.opt_outs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null,
  address text not null,
  created_at timestamptz not null default now(),
  unique (org_id, channel, address)
);

alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_enrollments enable row level security;
alter table public.workflow_step_runs enable row level security;
alter table public.workflow_audit enable row level security;
alter table public.conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.message_templates enable row level security;
alter table public.channel_connections enable row level security;
alter table public.opt_outs enable row level security;

create policy workflows_member_all on public.workflows
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy workflow_versions_member_all on public.workflow_versions
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy workflow_enrollments_member_all on public.workflow_enrollments
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy workflow_step_runs_member_all on public.workflow_step_runs
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy workflow_audit_member_all on public.workflow_audit
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy conversations_member_all on public.conversations
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy inbox_messages_member_all on public.inbox_messages
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy message_templates_member_all on public.message_templates
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy channel_connections_member_all on public.channel_connections
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy opt_outs_member_all on public.opt_outs
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
