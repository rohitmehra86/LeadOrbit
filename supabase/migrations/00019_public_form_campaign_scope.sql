-- Public form submissions must not attach another organization's campaign.
-- Replaces submit_public_form from 00013. Same signature.

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
  v_fields jsonb;
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

  v_campaign_id := v_form.campaign_id;
  if p_campaign_id is not null and exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.org_id = p_org_id
  ) then
    v_campaign_id := p_campaign_id;
  end if;

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

  v_fields := coalesce(p_payload, '{}'::jsonb);
  if coalesce(v_fields->>'consent', '') in ('true', '1', 'yes') then
    v_fields := v_fields || jsonb_build_object('consentRecordedAt', now());
  end if;

  if v_dup is null then
    insert into public.leads (
      org_id, email, phone, full_name, source, status, lifecycle_stage,
      score, pipeline_id, stage_id, custom_fields, sla_due_at, sla_state
    ) values (
      p_org_id, v_email, v_phone, v_full_name, 'form', 'new', 'lead',
      0, v_pipe, v_stage, v_fields,
      now() + interval '24 hours', 'ok'
    )
    returning id into v_lead_id;
  else
    select lead_id into v_lead_id from public.form_submissions where id = v_dup;
  end if;

  insert into public.form_submissions (
    org_id, form_id, campaign_id, lead_id, payload, utm, fingerprint, duplicate_of_id
  ) values (
    p_org_id, p_form_id, v_campaign_id, v_lead_id, v_fields,
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
