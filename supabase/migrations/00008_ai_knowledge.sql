-- Milestone 7: AI agents, usage, evals, knowledge/RAG, inventory.
-- Local runtime uses node:sqlite equivalent schema in packages/db.

create extension if not exists vector;

create table if not exists public.knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  collection_id uuid not null references public.knowledge_collections (id) on delete cascade,
  title text not null,
  kind text not null,
  status text not null,
  version int not null default 1,
  source_path text,
  mime_type text,
  byte_size int not null default 0,
  raw_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  collection_id uuid not null references public.knowledge_collections (id) on delete cascade,
  ordinal int not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_org_idx on public.knowledge_chunks (org_id);
-- IVFFlat / HNSW index applied when remote pgvector is provisioned.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  price numeric,
  currency text not null default 'USD',
  availability text not null default 'unknown',
  category text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);

create table if not exists public.ai_personas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  kind text not null,
  system_prompt text not null,
  locale text not null default 'en',
  tone text not null default 'concise-helpful',
  allowed_tools jsonb not null default '[]'::jsonb,
  allowed_channels jsonb not null default '[]'::jsonb,
  policies jsonb not null default '{}'::jsonb,
  handoff_rules jsonb not null default '{}'::jsonb,
  knowledge_collection_ids jsonb not null default '[]'::jsonb,
  prompt_version int not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  persona_id uuid not null references public.ai_personas (id) on delete cascade,
  version int not null,
  system_prompt text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  persona_id uuid,
  provider text not null,
  model text not null,
  status text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  estimated_cost_usd numeric,
  tool_calls int not null default 0,
  latency_ms int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_evals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  persona_id uuid,
  name text not null,
  input_json jsonb not null,
  expected_json jsonb not null,
  last_score numeric,
  last_ran_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_turns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  persona_id uuid,
  channel text not null,
  lead_id uuid,
  conversation_id uuid,
  user_text text not null,
  result_json jsonb not null,
  status text not null,
  created_at timestamptz not null default now()
);

alter table public.knowledge_collections enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.inventory_items enable row level security;
alter table public.ai_personas enable row level security;
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_evals enable row level security;
alter table public.ai_turns enable row level security;

create policy knowledge_collections_member on public.knowledge_collections
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy knowledge_documents_member on public.knowledge_documents
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy knowledge_chunks_member on public.knowledge_chunks
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy inventory_items_member on public.inventory_items
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ai_personas_member on public.ai_personas
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ai_prompt_versions_member on public.ai_prompt_versions
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ai_usage_events_member on public.ai_usage_events
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ai_evals_member on public.ai_evals
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy ai_turns_member on public.ai_turns
  for all using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
