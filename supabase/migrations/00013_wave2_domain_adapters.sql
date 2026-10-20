-- Wave 2: public capture + pipeline helpers for durable Supabase domain adapters.
-- Keeps RLS for members; anon may read published forms/pages and call submit RPC.

-- Published marketing assets readable by anon (public landing/forms).
drop policy if exists forms_public_read_published on public.forms;
create policy forms_public_read_published on public.forms
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists landing_pages_public_read_published on public.landing_pages;
create policy landing_pages_public_read_published on public.landing_pages
  for select to anon, authenticated
  using (status = 'published');

-- Ensure default lead pipeline + stages for an org (idempotent).
create or replace function public.ensure_org_lead_pipeline(p_org_id uuid)
returns table (pipeline_id uuid, stage_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipe uuid;
  v_stage uuid;
begin
  select id into v_pipe
  from public.pipelines
  where org_id = p_org_id and kind = 'lead' and is_default = true
  limit 1;

  if v_pipe is null then
    insert into public.pipelines (org_id, name, kind, is_default)
    values (p_org_id, 'Lead pipeline', 'lead', true)
    returning id into v_pipe;

    insert into public.pipeline_stages (org_id, pipeline_id, name, position, probability)
    values
      (p_org_id, v_pipe, 'New', 0, 10),
      (p_org_id, v_pipe, 'Contacted', 1, 25),
      (p_org_id, v_pipe, 'Qualified', 2, 60),
      (p_org_id, v_pipe, 'Unqualified', 3, 0)
    returning id into v_stage;

    select id into v_stage
    from public.pipeline_stages
    where pipeline_id = v_pipe
    order by position
    limit 1;
  else
    select id into v_stage
    from public.pipeline_stages
    where pipeline_id = v_pipe
    order by position
    limit 1;
  end if;

  pipeline_id := v_pipe;
  stage_id := v_stage;
  return next;
end;
$$;

revoke all on function public.ensure_org_lead_pipeline(uuid) from public;
grant execute on function public.ensure_org_lead_pipeline(uuid) to authenticated, service_role;

-- Public form submit: creates lead + submission under security definer (anon-safe).
create or replace function public.submit_public_form(
  p_org_id uuid,
  p_form_id uuid,
  p_payload jsonb,
  p_utm jsonb default '{}'::jsonb,
  p_campaign_id uuid default null,
  p_honeypot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forms%rowtype;
  v_campaign_id uuid;
  v_pipe uuid;
  v_stage uuid;
  v_lead_id uuid;
  v_sub_id uuid;
  v_fp text;
  v_full_name text;
  v_email text;
  v_phone text;
  v_dup uuid;
begin
  if coalesce(nullif(trim(p_honeypot), ''), '') <> '' then
    raise exception 'spam rejected' using errcode = '22023';
  end if;

  select * into v_form
  from public.forms
  where id = p_form_id and org_id = p_org_id and status = 'published';

  if not found then
    raise exception 'form not found or not published' using errcode = 'P0002';
  end if;

  v_campaign_id := coalesce(p_campaign_id, v_form.campaign_id);
  v_full_name := coalesce(
    nullif(trim(p_payload->>'fullName'), ''),
    nullif(trim(p_payload->>'full_name'), ''),
    'Website lead'
  );
  v_email := nullif(lower(trim(p_payload->>'email')), '');
  v_phone := nullif(trim(p_payload->>'phone'), '');
  v_fp := md5(p_form_id::text || coalesce(v_email, '') || coalesce(v_phone, '') || v_full_name);

  if v_form.duplicate_detection then
    select id into v_dup
    from public.form_submissions
    where org_id = p_org_id and fingerprint = v_fp
    limit 1;
  end if;

  select e.pipeline_id, e.stage_id into v_pipe, v_stage
  from public.ensure_org_lead_pipeline(p_org_id) e;

  if v_dup is null then
    insert into public.leads (
      org_id, email, phone, full_name, source, status, lifecycle_stage,
      score, pipeline_id, stage_id, custom_fields, sla_due_at, sla_state
    ) values (
      p_org_id, v_email, v_phone, v_full_name, 'form', 'new', 'lead',
      0, v_pipe, v_stage, coalesce(p_payload, '{}'::jsonb),
      now() + interval '24 hours', 'ok'
    )
    returning id into v_lead_id;
  else
    select lead_id into v_lead_id from public.form_submissions where id = v_dup;
  end if;

  insert into public.form_submissions (
    org_id, form_id, campaign_id, lead_id, payload, utm, fingerprint, duplicate_of_id
  ) values (
    p_org_id, p_form_id, v_campaign_id, v_lead_id, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_utm, '{}'::jsonb), v_fp, v_dup
  )
  returning id into v_sub_id;

  return jsonb_build_object(
    'submissionId', v_sub_id,
    'leadId', v_lead_id,
    'campaignId', v_campaign_id,
    'duplicateOfId', v_dup,
    'formId', p_form_id
  );
end;
$$;

revoke all on function public.submit_public_form(uuid, uuid, jsonb, jsonb, uuid, text) from public;
grant execute on function public.submit_public_form(uuid, uuid, jsonb, jsonb, uuid, text)
  to anon, authenticated, service_role;

-- Book a simple appointment (convert loop) for org members.
create or replace function public.book_lead_appointment(
  p_org_id uuid,
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_title text default null,
  p_duration_minutes int default 30,
  p_kind text default 'meeting',
  p_site_visit_address text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type_id uuid;
  v_appt public.appointments;
  v_ends timestamptz;
  v_lead public.leads%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_org_member(p_org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id and org_id = p_org_id;
  if not found then
    raise exception 'lead not found' using errcode = 'P0002';
  end if;

  select id into v_type_id
  from public.appointment_types
  where org_id = p_org_id and active = true
  order by created_at
  limit 1;

  if v_type_id is null then
    insert into public.appointment_types (
      org_id, name, kind, duration_minutes, timezone, requires_site_visit, description
    ) values (
      p_org_id,
      case when p_kind = 'site_visit' then 'Site visit' else 'Meeting' end,
      coalesce(nullif(p_kind, ''), 'meeting'),
      greatest(coalesce(p_duration_minutes, 30), 15),
      'UTC',
      p_kind = 'site_visit',
      'Auto-created by LeadOrbit convert loop'
    )
    returning id into v_type_id;
  end if;

  v_ends := p_starts_at + make_interval(mins => greatest(coalesce(p_duration_minutes, 30), 15));

  insert into public.appointments (
    org_id, appointment_type_id, lead_id, assignee_user_id, status, kind, title,
    starts_at, ends_at, timezone, buffer_before_minutes, buffer_after_minutes,
    blocked_start, blocked_end, site_visit_address, notes
  ) values (
    p_org_id, v_type_id, p_lead_id, coalesce(v_lead.owner_user_id, v_uid), 'scheduled',
    coalesce(nullif(p_kind, ''), 'meeting'),
    coalesce(nullif(trim(p_title), ''), 'Follow-up with ' || v_lead.full_name),
    p_starts_at, v_ends, 'UTC', 0, 0, p_starts_at, v_ends,
    p_site_visit_address, null
  )
  returning * into v_appt;

  return v_appt;
end;
$$;

revoke all on function public.book_lead_appointment(uuid, uuid, timestamptz, text, int, text, text) from public;
grant execute on function public.book_lead_appointment(uuid, uuid, timestamptz, text, int, text, text)
  to authenticated, service_role;
