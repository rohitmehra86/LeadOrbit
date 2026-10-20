-- Wave 3: Advanced CRM tables missing from Postgres, pipeline ensure (lead+deal),
-- invite accept RPC, convert-loop workflow template helper.

-- Assignment rules (SQLite had these; Postgres did not).
create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  strategy text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_rules_org_id_idx on public.assignment_rules (org_id);

alter table public.assignment_rules enable row level security;

drop policy if exists assignment_rules_member on public.assignment_rules;
create policy assignment_rules_member on public.assignment_rules
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'manager'));

-- Follow-up reminders
create table if not exists public.follow_up_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  due_at timestamptz not null,
  assigned_user_id uuid not null references public.profiles (id),
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists follow_up_reminders_org_id_idx on public.follow_up_reminders (org_id);

alter table public.follow_up_reminders enable row level security;

drop policy if exists follow_up_reminders_member on public.follow_up_reminders;
create policy follow_up_reminders_member on public.follow_up_reminders
  for all using (private.is_org_member(org_id))
  with check (private.has_org_permission(org_id, 'agent'));

-- Ensure lead + deal pipelines (idempotent). Used by CRM board / opportunity create.
create or replace function public.ensure_org_pipelines(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  v_deal uuid;
  v_lead_stage uuid;
  v_deal_stage uuid;
begin
  select id into v_lead
  from public.pipelines
  where org_id = p_org_id and kind = 'lead' and is_default = true
  limit 1;

  if v_lead is null then
    insert into public.pipelines (org_id, name, kind, is_default)
    values (p_org_id, 'Lead pipeline', 'lead', true)
    returning id into v_lead;

    insert into public.pipeline_stages (org_id, pipeline_id, name, position, probability, is_won, is_lost)
    values
      (p_org_id, v_lead, 'New', 0, 10, false, false),
      (p_org_id, v_lead, 'Contacted', 1, 25, false, false),
      (p_org_id, v_lead, 'Qualified', 2, 60, false, false),
      (p_org_id, v_lead, 'Unqualified', 3, 0, false, true);
  end if;

  select id into v_lead_stage
  from public.pipeline_stages
  where pipeline_id = v_lead
  order by position
  limit 1;

  select id into v_deal
  from public.pipelines
  where org_id = p_org_id and kind = 'deal' and is_default = true
  limit 1;

  if v_deal is null then
    insert into public.pipelines (org_id, name, kind, is_default)
    values (p_org_id, 'Deal pipeline', 'deal', true)
    returning id into v_deal;

    insert into public.pipeline_stages (org_id, pipeline_id, name, position, probability, is_won, is_lost)
    values
      (p_org_id, v_deal, 'Discovery', 0, 20, false, false),
      (p_org_id, v_deal, 'Proposal', 1, 50, false, false),
      (p_org_id, v_deal, 'Negotiation', 2, 75, false, false),
      (p_org_id, v_deal, 'Won', 3, 100, true, false),
      (p_org_id, v_deal, 'Lost', 4, 0, false, true);
  end if;

  select id into v_deal_stage
  from public.pipeline_stages
  where pipeline_id = v_deal and is_won = false and is_lost = false
  order by position
  limit 1;

  return jsonb_build_object(
    'leadPipelineId', v_lead,
    'leadStageId', v_lead_stage,
    'dealPipelineId', v_deal,
    'dealStageId', v_deal_stage
  );
end;
$$;

revoke all on function public.ensure_org_pipelines(uuid) from public;
grant execute on function public.ensure_org_pipelines(uuid) to authenticated, service_role;

-- Keep Wave 2 helper aligned with dual pipelines.
create or replace function public.ensure_org_lead_pipeline(p_org_id uuid)
returns table (pipeline_id uuid, stage_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := public.ensure_org_pipelines(p_org_id);
  pipeline_id := (v->>'leadPipelineId')::uuid;
  stage_id := (v->>'leadStageId')::uuid;
  return next;
end;
$$;

-- Accept invite by token hash (bypasses manager-only invite SELECT for the invitee).
create or replace function public.accept_org_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_uid uuid := auth.uid();
  v_email text;
  v_membership public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_uid;
  if v_email is null then
    v_email := coalesce(auth.jwt() ->> 'email', '');
  end if;

  select * into v_invite
  from public.invites
  where token_hash = p_token_hash and status = 'pending'
  limit 1;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  if v_invite.expires_at < now() then
    update public.invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite expired' using errcode = '22023';
  end if;

  if lower(v_email) <> lower(v_invite.email) then
    raise exception 'invite email mismatch' using errcode = '42501';
  end if;

  select * into v_membership
  from public.memberships
  where org_id = v_invite.org_id and user_id = v_uid
  limit 1;

  if found then
    update public.invites set status = 'accepted' where id = v_invite.id;
    return jsonb_build_object(
      'id', v_membership.id,
      'orgId', v_membership.org_id,
      'userId', v_membership.user_id,
      'role', v_membership.role,
      'status', v_membership.status,
      'createdAt', v_membership.created_at,
      'updatedAt', v_membership.updated_at
    );
  end if;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_invite.org_id, v_uid, v_invite.role, 'active')
  returning * into v_membership;

  update public.invites set status = 'accepted' where id = v_invite.id;

  return jsonb_build_object(
    'id', v_membership.id,
    'orgId', v_membership.org_id,
    'userId', v_membership.user_id,
    'role', v_membership.role,
    'status', v_membership.status,
    'createdAt', v_membership.created_at,
    'updatedAt', v_membership.updated_at
  );
end;
$$;

revoke all on function public.accept_org_invite(text) from public;
grant execute on function public.accept_org_invite(text) to authenticated;

create index if not exists invites_token_hash_idx on public.invites (token_hash);

-- Convert-loop workflow template seed helper (form_submitted → qualify → task → notify).
create or replace function public.seed_convert_workflow_template(p_org_id uuid, p_name text default 'Convert loop')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_graph jsonb := '{
    "version": 1,
    "nodes": [
      {"id":"trg_form","kind":"trigger","type":"form_submitted","label":"Form submitted","config":{},"position":{"x":80,"y":80}},
      {"id":"act_qualify","kind":"action","type":"ai_qualify","label":"Qualify lead","config":{"mode":"deterministic"},"position":{"x":80,"y":180}},
      {"id":"act_task","kind":"action","type":"create_task","label":"Follow-up task","config":{"title":"Follow up within 24h"},"position":{"x":80,"y":280}},
      {"id":"act_notify","kind":"action","type":"notify","label":"Notify owner","config":{"channel":"in_app"},"position":{"x":80,"y":380}}
    ],
    "edges": [
      {"id":"e1","from":"trg_form","to":"act_qualify"},
      {"id":"e2","from":"act_qualify","to":"act_task"},
      {"id":"e3","from":"act_task","to":"act_notify"}
    ]
  }'::jsonb;
begin
  if not private.is_org_member(p_org_id) and not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.workflows (org_id, name, status, graph, version, test_mode)
  values (p_org_id, coalesce(nullif(trim(p_name), ''), 'Convert loop'), 'draft', v_graph, 1, false)
  returning id into v_id;

  insert into public.workflow_versions (org_id, workflow_id, version, graph, note)
  values (p_org_id, v_id, 1, v_graph, 'convert_loop_template');

  return v_id;
end;
$$;

revoke all on function public.seed_convert_workflow_template(uuid, text) from public;
grant execute on function public.seed_convert_workflow_template(uuid, text) to authenticated, service_role;
