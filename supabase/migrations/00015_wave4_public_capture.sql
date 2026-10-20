-- Wave 4: durable public capture token + ingest_public_lead RPC for AUTH_MODE=supabase.

create table if not exists public.org_capture_tokens (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_capture_tokens enable row level security;

drop policy if exists org_capture_tokens_manager on public.org_capture_tokens;
create policy org_capture_tokens_manager on public.org_capture_tokens
  for all using (private.has_org_permission(org_id, 'manager'))
  with check (private.has_org_permission(org_id, 'manager'));

-- Optional marketing spend events already fit marketing_events.event_type text; no schema change.

create or replace function public.ingest_public_lead(
  p_org_id uuid,
  p_token_hash text,
  p_payload jsonb,
  p_utm jsonb default '{}'::jsonb,
  p_campaign_id uuid default null,
  p_idempotency_key text default null,
  p_source text default 'public_capture'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.org_capture_tokens%rowtype;
  v_pipe uuid;
  v_stage uuid;
  v_lead_id uuid;
  v_event_id uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_fp text;
  v_idem text;
  v_existing public.ingestion_events%rowtype;
  v_dup boolean := false;
begin
  select * into v_token
  from public.org_capture_tokens
  where org_id = p_org_id and token_hash = p_token_hash;

  if not found then
    raise exception 'invalid capture credentials' using errcode = '42501';
  end if;

  v_full_name := coalesce(
    nullif(trim(p_payload->>'fullName'), ''),
    nullif(trim(p_payload->>'full_name'), ''),
    'Website lead'
  );
  v_email := nullif(lower(trim(p_payload->>'email')), '');
  v_phone := nullif(trim(p_payload->>'phone'), '');
  v_fp := md5(p_org_id::text || coalesce(v_email, '') || coalesce(v_phone, '') || v_full_name);
  v_idem := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_idem is not null then
    select * into v_existing
    from public.ingestion_events
    where org_id = p_org_id and idempotency_key = ('public_capture:' || v_idem)
    limit 1;
    if found then
      return jsonb_build_object(
        'leadId', v_existing.lead_id,
        'eventId', v_existing.id,
        'status', v_existing.status,
        'duplicate', true,
        'campaignId', v_existing.campaign_id
      );
    end if;
  end if;

  select e.pipeline_id, e.stage_id into v_pipe, v_stage
  from public.ensure_org_lead_pipeline(p_org_id) e;

  insert into public.leads (
    org_id, email, phone, full_name, source, status, lifecycle_stage,
    score, pipeline_id, stage_id, custom_fields, sla_due_at, sla_state,
    idempotency_key
  ) values (
    p_org_id, v_email, v_phone, v_full_name, coalesce(nullif(trim(p_source), ''), 'public_capture'),
    'new', 'lead', 0, v_pipe, v_stage,
    jsonb_build_object('utm', coalesce(p_utm, '{}'::jsonb), 'ingestionChannel', 'public_capture'),
    now() + interval '24 hours', 'ok',
    case when v_idem is null then null else 'public_capture:' || v_idem end
  )
  on conflict (org_id, idempotency_key) do update
    set updated_at = now()
  returning id into v_lead_id;

  insert into public.ingestion_events (
    org_id, channel, status, idempotency_key, lead_id, campaign_id,
    fingerprint, payload
  ) values (
    p_org_id, 'public_capture', 'accepted',
    case when v_idem is null then null else 'public_capture:' || v_idem end,
    v_lead_id, p_campaign_id, v_fp, coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  insert into public.attribution_touchpoints (
    org_id, lead_id, campaign_id, channel, utm, meta
  ) values (
    p_org_id, v_lead_id, p_campaign_id, 'public_capture',
    coalesce(p_utm, '{}'::jsonb),
    jsonb_build_object('source', p_source)
  );

  insert into public.lead_attribution (
    lead_id, org_id, model, campaign_id, weight_by_campaign, updated_at
  ) values (
    v_lead_id, p_org_id, 'last_touch', p_campaign_id,
    case when p_campaign_id is null then '{}'::jsonb
         else jsonb_build_object(p_campaign_id::text, 1) end,
    now()
  )
  on conflict (lead_id, org_id) do update
    set campaign_id = excluded.campaign_id,
        weight_by_campaign = excluded.weight_by_campaign,
        updated_at = now();

  return jsonb_build_object(
    'leadId', v_lead_id,
    'eventId', v_event_id,
    'status', 'accepted',
    'duplicate', v_dup,
    'campaignId', p_campaign_id
  );
end;
$$;

revoke all on function public.ingest_public_lead(uuid, text, jsonb, jsonb, uuid, text, text) from public;
grant execute on function public.ingest_public_lead(uuid, text, jsonb, jsonb, uuid, text, text)
  to anon, authenticated, service_role;

-- Manager helper to set/rotate capture token hash (plaintext never stored).
create or replace function public.set_org_capture_token_hash(p_org_id uuid, p_token_hash text, p_label text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_org_permission(p_org_id, 'manager') and not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.org_capture_tokens (org_id, token_hash, label, updated_at)
  values (p_org_id, p_token_hash, p_label, now())
  on conflict (org_id) do update
    set token_hash = excluded.token_hash,
        label = coalesce(excluded.label, public.org_capture_tokens.label),
        updated_at = now();
end;
$$;

revoke all on function public.set_org_capture_token_hash(uuid, text, text) from public;
grant execute on function public.set_org_capture_token_hash(uuid, text, text) to authenticated, service_role;
