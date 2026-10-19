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
`;

export function defaultDbPath(): string {
  return (
    process.env.LEADORBIT_SQLITE_PATH ||
    join(process.cwd(), ".data", "leadorbit.sqlite")
  );
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
  }
  return globalDb.__leadorbitSqlite;
}

export function resetCrmDatabaseForTests(path?: string): DatabaseSync {
  const db = openCrmDatabase(path ?? `:memory:`);
  globalDb.__leadorbitSqlite = db;
  return db;
}
