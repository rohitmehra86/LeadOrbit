import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
create table if not exists crm_orgs (
  id text primary key,
  name text not null
);

create table if not exists companies (
  id text primary key,
  org_id text not null,
  name text not null,
  domain text,
  industry text,
  owner_user_id text,
  custom_fields text not null default '{}',
  created_at text not null,
  updated_at text not null
);
create index if not exists companies_org_idx on companies(org_id);

create table if not exists contacts (
  id text primary key,
  org_id text not null,
  company_id text,
  email text,
  phone text,
  full_name text not null,
  title text,
  owner_user_id text,
  custom_fields text not null default '{}',
  created_at text not null,
  updated_at text not null
);
create index if not exists contacts_org_idx on contacts(org_id);
create index if not exists contacts_email_idx on contacts(org_id, email);

create table if not exists pipelines (
  id text primary key,
  org_id text not null,
  name text not null,
  kind text not null,
  is_default integer not null default 0
);

create table if not exists pipeline_stages (
  id text primary key,
  org_id text not null,
  pipeline_id text not null,
  name text not null,
  position integer not null,
  probability integer not null default 0,
  is_won integer not null default 0,
  is_lost integer not null default 0
);

create table if not exists leads (
  id text primary key,
  org_id text not null,
  email text,
  phone text,
  full_name text not null,
  company_id text,
  contact_id text,
  source text not null,
  status text not null,
  lifecycle_stage text not null,
  score integer not null default 0,
  owner_user_id text,
  territory text,
  pipeline_id text,
  stage_id text,
  idempotency_key text,
  custom_fields text not null default '{}',
  sla_due_at text,
  sla_state text not null default 'ok',
  created_at text not null,
  updated_at text not null,
  unique(org_id, idempotency_key)
);
create index if not exists leads_org_idx on leads(org_id);
create index if not exists leads_owner_idx on leads(org_id, owner_user_id);
create index if not exists leads_email_idx on leads(org_id, email);

create table if not exists opportunities (
  id text primary key,
  org_id text not null,
  name text not null,
  pipeline_id text not null,
  stage_id text not null,
  lead_id text,
  contact_id text,
  company_id text,
  amount real not null default 0,
  currency text not null default 'USD',
  status text not null,
  owner_user_id text,
  expected_close_date text,
  custom_fields text not null default '{}',
  created_at text not null,
  updated_at text not null
);
create index if not exists opps_org_idx on opportunities(org_id);

create table if not exists tasks (
  id text primary key,
  org_id text not null,
  title text not null,
  description text,
  status text not null,
  due_at text,
  owner_user_id text,
  entity_type text not null,
  entity_id text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists notes (
  id text primary key,
  org_id text not null,
  body text not null,
  author_user_id text not null,
  entity_type text not null,
  entity_id text not null,
  created_at text not null
);

create table if not exists activities (
  id text primary key,
  org_id text not null,
  actor_user_id text,
  entity_type text not null,
  entity_id text not null,
  activity_type text not null,
  summary text not null,
  payload text not null default '{}',
  created_at text not null
);
create index if not exists activities_entity_idx on activities(org_id, entity_type, entity_id, created_at);

create table if not exists attachments (
  id text primary key,
  org_id text not null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  storage_path text not null,
  entity_type text not null,
  entity_id text not null,
  uploaded_by_user_id text not null,
  created_at text not null
);

create table if not exists tags (
  id text primary key,
  org_id text not null,
  name text not null,
  color text,
  unique(org_id, name)
);

create table if not exists taggings (
  tag_id text not null,
  org_id text not null,
  entity_type text not null,
  entity_id text not null,
  primary key (tag_id, entity_type, entity_id)
);

create table if not exists custom_field_defs (
  id text primary key,
  org_id text not null,
  entity_type text not null,
  key text not null,
  label text not null,
  field_type text not null,
  options text not null default '[]',
  required integer not null default 0,
  unique(org_id, entity_type, key)
);

create table if not exists saved_views (
  id text primary key,
  org_id text not null,
  name text not null,
  entity_type text not null,
  filters text not null default '{}',
  columns text not null default '[]',
  sort text,
  owner_user_id text not null
);

create table if not exists segments (
  id text primary key,
  org_id text not null,
  name text not null,
  entity_type text not null,
  definition text not null default '{}'
);

create table if not exists assignment_rules (
  id text primary key,
  org_id text not null,
  name text not null,
  strategy text not null,
  enabled integer not null default 1,
  config text not null default '{}'
);

create table if not exists ownership_history (
  id text primary key,
  org_id text not null,
  entity_type text not null,
  entity_id text not null,
  from_user_id text,
  to_user_id text,
  reason text not null,
  changed_by_user_id text not null,
  created_at text not null
);

create table if not exists follow_up_reminders (
  id text primary key,
  org_id text not null,
  entity_type text not null,
  entity_id text not null,
  due_at text not null,
  assigned_user_id text not null,
  status text not null,
  note text,
  created_at text not null
);

create table if not exists agent_availability (
  org_id text not null,
  user_id text not null,
  available integer not null default 1,
  territories text not null default '[]',
  primary key (org_id, user_id)
);

create table if not exists campaigns (
  id text primary key,
  org_id text not null,
  name text not null,
  objective text not null,
  status text not null,
  audience text not null default '{}',
  ad_copy text not null default '',
  landing_page_id text,
  form_id text,
  utm text not null default '{}',
  budget text not null default '{}',
  schedule_start text,
  schedule_end text,
  template_key text,
  ab_test_enabled integer not null default 0,
  ab_variants text not null default '[]',
  attribution_model text not null default 'last_touch',
  created_at text not null,
  updated_at text not null
);
create index if not exists campaigns_org_idx on campaigns(org_id);

create table if not exists creative_assets (
  id text primary key,
  org_id text not null,
  name text not null,
  content_type text not null,
  storage_path text not null,
  width integer,
  height integer,
  tags text not null default '[]',
  created_at text not null
);
create index if not exists creatives_org_idx on creative_assets(org_id);

create table if not exists forms (
  id text primary key,
  org_id text not null,
  campaign_id text,
  name text not null,
  status text not null,
  fields text not null default '[]',
  multi_step integer not null default 0,
  spam_honeypot_enabled integer not null default 1,
  duplicate_detection integer not null default 1,
  consent_text text,
  webhook_url text,
  embed_enabled integer not null default 1,
  version integer not null default 1,
  template_key text,
  thank_you_message text not null default 'Thank you',
  created_at text not null,
  updated_at text not null
);
create index if not exists forms_org_idx on forms(org_id);

create table if not exists form_versions (
  id text primary key,
  org_id text not null,
  form_id text not null,
  version integer not null,
  fields text not null,
  created_at text not null,
  note text
);

create table if not exists form_submissions (
  id text primary key,
  org_id text not null,
  form_id text not null,
  campaign_id text,
  lead_id text,
  payload text not null default '{}',
  utm text not null default '{}',
  fingerprint text not null,
  duplicate_of_id text,
  created_at text not null
);
create index if not exists form_submissions_org_idx on form_submissions(org_id, form_id);
create index if not exists form_submissions_fp_idx on form_submissions(org_id, fingerprint);

create table if not exists landing_pages (
  id text primary key,
  org_id text not null,
  campaign_id text,
  form_id text,
  name text not null,
  slug text not null,
  status text not null,
  document text not null,
  template_key text,
  version integer not null default 1,
  published_at text,
  created_at text not null,
  updated_at text not null,
  unique(org_id, slug)
);
create index if not exists landing_pages_org_idx on landing_pages(org_id);

create table if not exists page_versions (
  id text primary key,
  org_id text not null,
  page_id text not null,
  version integer not null,
  document text not null,
  created_at text not null,
  note text
);

create table if not exists funnels (
  id text primary key,
  org_id text not null,
  campaign_id text,
  name text not null,
  status text not null,
  steps text not null default '[]',
  created_at text not null,
  updated_at text not null
);

create table if not exists marketing_events (
  id text primary key,
  org_id text not null,
  campaign_id text,
  page_id text,
  form_id text,
  event_type text not null,
  meta text not null default '{}',
  created_at text not null
);
create index if not exists marketing_events_org_idx on marketing_events(org_id, campaign_id, event_type);

create table if not exists ad_integrations (
  id text primary key,
  org_id text not null,
  network text not null,
  status text not null,
  external_account_id text,
  last_error text,
  created_at text not null,
  updated_at text not null,
  unique(org_id, network)
);

create table if not exists webhook_endpoints (
  id text primary key,
  org_id text not null,
  name text not null,
  secret text not null,
  enabled integer not null default 1,
  channel text not null default 'webhook',
  created_at text not null,
  updated_at text not null
);
create index if not exists webhook_endpoints_org_idx on webhook_endpoints(org_id);

create table if not exists webhook_deliveries (
  id text primary key,
  org_id text not null,
  endpoint_id text,
  direction text not null,
  target_url text,
  status text not null,
  attempt_count integer not null default 0,
  next_retry_at text,
  last_status_code integer,
  last_error text,
  payload text not null default '{}',
  created_at text not null,
  updated_at text not null
);
create index if not exists webhook_deliveries_org_idx on webhook_deliveries(org_id, status);

create table if not exists ingestion_events (
  id text primary key,
  org_id text not null,
  channel text not null,
  status text not null,
  idempotency_key text,
  external_event_id text,
  lead_id text,
  campaign_id text,
  form_id text,
  page_id text,
  fingerprint text,
  duplicate_of_event_id text,
  payload text not null default '{}',
  error text,
  created_at text not null,
  unique(org_id, idempotency_key)
);
create index if not exists ingestion_events_org_idx on ingestion_events(org_id, created_at);
create index if not exists ingestion_events_fp_idx on ingestion_events(org_id, fingerprint);

create table if not exists attribution_touchpoints (
  id text primary key,
  org_id text not null,
  lead_id text,
  opportunity_id text,
  campaign_id text,
  channel text not null,
  utm text not null default '{}',
  occurred_at text not null,
  meta text not null default '{}'
);
create index if not exists attribution_tp_lead_idx on attribution_touchpoints(org_id, lead_id);

create table if not exists channel_adapters (
  id text primary key,
  org_id text not null,
  channel text not null,
  enabled integer not null default 1,
  config text not null default '{}',
  status text not null,
  last_error text,
  created_at text not null,
  updated_at text not null,
  unique(org_id, channel)
);

create table if not exists lead_attribution (
  lead_id text not null,
  org_id text not null,
  model text not null,
  campaign_id text,
  opportunity_id text,
  weight_by_campaign text not null default '{}',
  updated_at text not null,
  primary key (lead_id, org_id)
);

create table if not exists durable_jobs (
  id text primary key,
  name text not null,
  payload text not null,
  status text not null,
  attempts integer not null default 0,
  run_at text not null,
  locked_at text,
  idempotency_key text,
  last_error text,
  created_at text not null,
  updated_at text not null,
  unique(idempotency_key)
);
create index if not exists durable_jobs_due_idx on durable_jobs(status, run_at);

create table if not exists workflows (
  id text primary key,
  org_id text not null,
  name text not null,
  status text not null,
  graph text not null,
  version integer not null default 1,
  test_mode integer not null default 0,
  published_at text,
  created_at text not null,
  updated_at text not null
);
create index if not exists workflows_org_idx on workflows(org_id);

create table if not exists workflow_versions (
  id text primary key,
  org_id text not null,
  workflow_id text not null,
  version integer not null,
  graph text not null,
  note text,
  created_at text not null
);

create table if not exists workflow_enrollments (
  id text primary key,
  org_id text not null,
  workflow_id text not null,
  workflow_version integer not null,
  lead_id text,
  conversation_id text,
  status text not null,
  current_node_id text,
  context text not null default '{}',
  idempotency_key text,
  test_mode integer not null default 0,
  created_at text not null,
  updated_at text not null,
  unique(org_id, idempotency_key)
);
create index if not exists workflow_enrollments_org_idx on workflow_enrollments(org_id, status);

create table if not exists workflow_step_runs (
  id text primary key,
  org_id text not null,
  enrollment_id text not null,
  node_id text not null,
  attempt integer not null,
  status text not null,
  input text not null default '{}',
  output text not null default '{}',
  error text,
  created_at text not null,
  updated_at text not null
);

create table if not exists workflow_audit (
  id text primary key,
  org_id text not null,
  workflow_id text,
  enrollment_id text,
  action text not null,
  actor_user_id text,
  detail text not null default '{}',
  created_at text not null
);

create table if not exists conversations (
  id text primary key,
  org_id text not null,
  channel text not null,
  subject text,
  status text not null,
  assignee_user_id text,
  lead_id text,
  contact_address text,
  unread_count integer not null default 0,
  tags text not null default '[]',
  sla_due_at text,
  last_message_at text,
  consent_ok integer not null default 1,
  opted_out integer not null default 0,
  created_at text not null,
  updated_at text not null
);
create index if not exists conversations_org_idx on conversations(org_id, status);

create table if not exists inbox_messages (
  id text primary key,
  org_id text not null,
  conversation_id text not null,
  direction text not null,
  channel text not null,
  body text not null,
  html_body text,
  template_key text,
  attachment_paths text not null default '[]',
  delivery_status text not null,
  provider_message_id text,
  sender_user_id text,
  is_internal_note integer not null default 0,
  error text,
  created_at text not null
);
create index if not exists inbox_messages_conv_idx on inbox_messages(org_id, conversation_id, created_at);

create table if not exists message_templates (
  id text primary key,
  org_id text not null,
  channel text not null,
  key text not null,
  name text not null,
  body text not null,
  created_at text not null,
  unique(org_id, channel, key)
);

create table if not exists channel_connections (
  id text primary key,
  org_id text not null,
  channel text not null,
  status text not null,
  webhook_secret text,
  config text not null default '{}',
  last_error text,
  created_at text not null,
  updated_at text not null,
  unique(org_id, channel)
);

create table if not exists opt_outs (
  id text primary key,
  org_id text not null,
  channel text not null,
  address text not null,
  created_at text not null,
  unique(org_id, channel, address)
);

-- Milestone 7: AI agents + knowledge / RAG
create table if not exists knowledge_collections (
  id text primary key,
  org_id text not null,
  name text not null,
  description text,
  created_at text not null,
  updated_at text not null
);
create index if not exists knowledge_collections_org_idx on knowledge_collections(org_id);

create table if not exists knowledge_documents (
  id text primary key,
  org_id text not null,
  collection_id text not null,
  title text not null,
  kind text not null,
  status text not null,
  version integer not null default 1,
  source_path text,
  mime_type text,
  byte_size integer not null default 0,
  raw_text text not null default '',
  metadata text not null default '{}',
  error text,
  created_at text not null,
  updated_at text not null
);
create index if not exists knowledge_documents_org_idx on knowledge_documents(org_id);
create index if not exists knowledge_documents_collection_idx on knowledge_documents(org_id, collection_id);

create table if not exists knowledge_chunks (
  id text primary key,
  org_id text not null,
  document_id text not null,
  collection_id text not null,
  ordinal integer not null,
  content text not null,
  embedding text,
  metadata text not null default '{}',
  created_at text not null
);
create index if not exists knowledge_chunks_org_doc_idx on knowledge_chunks(org_id, document_id);
create index if not exists knowledge_chunks_org_collection_idx on knowledge_chunks(org_id, collection_id);

create table if not exists inventory_items (
  id text primary key,
  org_id text not null,
  sku text not null,
  name text not null,
  description text,
  price real,
  currency text not null default 'USD',
  availability text not null default 'unknown',
  category text,
  metadata text not null default '{}',
  created_at text not null,
  updated_at text not null,
  unique(org_id, sku)
);
create index if not exists inventory_items_org_idx on inventory_items(org_id);

create table if not exists ai_personas (
  id text primary key,
  org_id text not null,
  name text not null,
  kind text not null,
  system_prompt text not null,
  locale text not null default 'en',
  tone text not null default 'concise-helpful',
  allowed_tools text not null default '[]',
  allowed_channels text not null default '[]',
  policies text not null default '{}',
  handoff_rules text not null default '{}',
  knowledge_collection_ids text not null default '[]',
  prompt_version integer not null default 1,
  enabled integer not null default 1,
  created_at text not null,
  updated_at text not null
);
create index if not exists ai_personas_org_idx on ai_personas(org_id);

create table if not exists ai_prompt_versions (
  id text primary key,
  org_id text not null,
  persona_id text not null,
  version integer not null,
  system_prompt text not null,
  note text,
  created_at text not null
);

create table if not exists ai_usage_events (
  id text primary key,
  org_id text not null,
  persona_id text,
  provider text not null,
  model text not null,
  status text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost_usd real,
  tool_calls integer not null default 0,
  latency_ms integer not null default 0,
  created_at text not null
);
create index if not exists ai_usage_org_idx on ai_usage_events(org_id);

create table if not exists ai_evals (
  id text primary key,
  org_id text not null,
  persona_id text,
  name text not null,
  input_json text not null,
  expected_json text not null,
  last_score real,
  last_ran_at text,
  created_at text not null
);

create table if not exists ai_turns (
  id text primary key,
  org_id text not null,
  persona_id text,
  channel text not null,
  lead_id text,
  conversation_id text,
  user_text text not null,
  result_json text not null,
  status text not null,
  created_at text not null
);
create index if not exists ai_turns_org_idx on ai_turns(org_id);
`;

export function defaultDbPath(): string {
  if (process.env.LEADORBIT_SQLITE_PATH) {
    return process.env.LEADORBIT_SQLITE_PATH;
  }
  // Share one DB across apps/web and apps/worker (repo-root .data).
  const cwd = process.cwd();
  if (cwd.endsWith(`${"/"}apps/web`) || cwd.endsWith(`${"/"}apps/worker`)) {
    return join(cwd, "..", "..", ".data", "leadorbit.sqlite");
  }
  return join(cwd, ".data", "leadorbit.sqlite");
}

export function openCrmDatabase(path = defaultDbPath()): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("pragma journal_mode = WAL;");
  db.exec("pragma foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

const globalDb = globalThis as typeof globalThis & {
  __leadorbitSqlite?: DatabaseSync;
};

export function getCrmDatabase(): DatabaseSync {
  if (!globalDb.__leadorbitSqlite) {
    globalDb.__leadorbitSqlite = openCrmDatabase();
  } else {
    // Re-apply idempotent DDL so milestone schema additions land on warm singletons.
    globalDb.__leadorbitSqlite.exec(SCHEMA);
  }
  return globalDb.__leadorbitSqlite;
}

export function resetCrmDatabaseForTests(path?: string): DatabaseSync {
  const db = openCrmDatabase(path ?? `:memory:`);
  globalDb.__leadorbitSqlite = db;
  return db;
}
