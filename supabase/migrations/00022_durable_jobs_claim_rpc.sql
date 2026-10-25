-- Harden durable_jobs for multi-worker Postgres claiming.
-- Existing table from 00007; add lease columns, constraints, SKIP LOCKED claim RPCs.
-- EXECUTE granted to service_role only — never anon/authenticated.

alter table public.durable_jobs
  add column if not exists locked_by text,
  add column if not exists max_attempts int not null default 5;

alter table public.durable_jobs
  drop constraint if exists durable_jobs_status_check;
alter table public.durable_jobs
  add constraint durable_jobs_status_check
  check (status in ('pending', 'running', 'completed', 'failed', 'dead_letter'));

alter table public.durable_jobs
  drop constraint if exists durable_jobs_attempts_check;
alter table public.durable_jobs
  add constraint durable_jobs_attempts_check
  check (attempts >= 0);

alter table public.durable_jobs
  drop constraint if exists durable_jobs_max_attempts_check;
alter table public.durable_jobs
  add constraint durable_jobs_max_attempts_check
  check (max_attempts >= 1 and max_attempts <= 50);

create index if not exists durable_jobs_due_idx
  on public.durable_jobs (status, run_at)
  where status = 'pending';

create index if not exists durable_jobs_running_lease_idx
  on public.durable_jobs (locked_at)
  where status = 'running';

alter table public.durable_jobs enable row level security;

drop policy if exists durable_jobs_deny_all on public.durable_jobs;
create policy durable_jobs_deny_all on public.durable_jobs
  for all
  to authenticated, anon
  using (false)
  with check (false);

create or replace function public.enqueue_durable_job(
  p_name text,
  p_payload jsonb,
  p_idempotency_key text default null,
  p_delay_ms int default 0,
  p_max_attempts int default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.durable_jobs%rowtype;
  v_id uuid;
  v_run_at timestamptz;
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
begin
  if coalesce(nullif(trim(p_name), ''), '') is null then
    raise exception 'job name required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'job payload must be a json object' using errcode = '22023';
  end if;
  if coalesce(p_delay_ms, 0) < 0 then
    raise exception 'delay_ms must be >= 0' using errcode = '22023';
  end if;

  if v_key is not null then
    select * into v_existing
    from public.durable_jobs
    where idempotency_key = v_key;
    if found then
      return jsonb_build_object(
        'jobId', v_existing.id,
        'duplicate', true,
        'status', v_existing.status
      );
    end if;
  end if;

  v_run_at := now() + make_interval(secs => greatest(coalesce(p_delay_ms, 0), 0) / 1000.0);

  begin
    insert into public.durable_jobs (
      name, payload, status, attempts, run_at, locked_at, locked_by,
      idempotency_key, last_error, max_attempts
    ) values (
      p_name,
      p_payload,
      'pending',
      0,
      v_run_at,
      null,
      null,
      v_key,
      null,
      least(greatest(coalesce(p_max_attempts, 5), 1), 50)
    )
    returning id into v_id;
  exception
    when unique_violation then
      if v_key is null then
        raise;
      end if;
      select * into v_existing
      from public.durable_jobs
      where idempotency_key = v_key;
      if found then
        return jsonb_build_object(
          'jobId', v_existing.id,
          'duplicate', true,
          'status', v_existing.status
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'jobId', v_id,
    'duplicate', false,
    'status', 'pending'
  );
end;
$$;

create or replace function public.claim_durable_jobs(
  p_limit int default 10,
  p_worker_id text default null,
  p_lease_seconds int default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker text := coalesce(nullif(trim(p_worker_id), ''), 'worker');
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_lease int := greatest(coalesce(p_lease_seconds, 300), 30);
  v_result jsonb;
begin
  update public.durable_jobs
  set
    status = 'pending',
    locked_at = null,
    locked_by = null,
    updated_at = now(),
    last_error = coalesce(last_error, 'lease expired — requeued')
  where status = 'running'
    and locked_at is not null
    and locked_at < now() - make_interval(secs => v_lease);

  with due as (
    select id
    from public.durable_jobs
    where status = 'pending'
      and run_at <= now()
    order by run_at asc
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.durable_jobs j
    set
      status = 'running',
      locked_at = now(),
      locked_by = v_worker,
      attempts = j.attempts + 1,
      updated_at = now()
    from due
    where j.id = due.id
    returning
      j.id,
      j.name,
      j.payload,
      j.status,
      j.attempts,
      j.max_attempts,
      j.run_at,
      j.locked_at,
      j.locked_by,
      j.last_error,
      j.idempotency_key,
      j.created_at,
      j.updated_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'payload', c.payload,
        'status', c.status,
        'attempts', c.attempts,
        'maxAttempts', c.max_attempts,
        'runAt', c.run_at,
        'lockedAt', c.locked_at,
        'lockedBy', c.locked_by,
        'lastError', c.last_error,
        'idempotencyKey', c.idempotency_key,
        'createdAt', c.created_at,
        'updatedAt', c.updated_at
      )
      order by c.run_at
    ),
    '[]'::jsonb
  )
  into v_result
  from claimed c;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.complete_durable_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.durable_jobs%rowtype;
begin
  update public.durable_jobs
  set
    status = 'completed',
    locked_at = null,
    locked_by = null,
    updated_at = now(),
    last_error = null
  where id = p_job_id
    and status = 'running'
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'detail', 'job not running or missing');
  end if;
  return jsonb_build_object('ok', true, 'jobId', v_row.id, 'status', v_row.status);
end;
$$;

create or replace function public.fail_durable_job(
  p_job_id uuid,
  p_error text,
  p_retry_delay_ms int default null,
  p_dead_letter boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.durable_jobs%rowtype;
  v_error text := left(coalesce(nullif(trim(p_error), ''), 'job failed'), 2000);
  v_dead boolean := coalesce(p_dead_letter, false);
begin
  select * into v_row from public.durable_jobs where id = p_job_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'detail', 'job missing');
  end if;

  if v_dead or v_row.attempts >= v_row.max_attempts or p_retry_delay_ms is null then
    update public.durable_jobs
    set
      status = 'dead_letter',
      last_error = v_error,
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = p_job_id;
    return jsonb_build_object('ok', true, 'jobId', p_job_id, 'status', 'dead_letter');
  end if;

  update public.durable_jobs
  set
    status = 'pending',
    last_error = v_error,
    run_at = now() + make_interval(secs => greatest(p_retry_delay_ms, 0) / 1000.0),
    locked_at = null,
    locked_by = null,
    updated_at = now()
  where id = p_job_id;

  return jsonb_build_object('ok', true, 'jobId', p_job_id, 'status', 'pending');
end;
$$;

create or replace function public.recover_stale_durable_jobs(
  p_lease_seconds int default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_lease int := greatest(coalesce(p_lease_seconds, 300), 30);
begin
  with recovered as (
    update public.durable_jobs
    set
      status = 'pending',
      locked_at = null,
      locked_by = null,
      updated_at = now(),
      last_error = coalesce(last_error, 'lease expired — requeued')
    where status = 'running'
      and locked_at is not null
      and locked_at < now() - make_interval(secs => v_lease)
    returning id
  )
  select count(*)::int into v_count from recovered;
  return jsonb_build_object('recovered', coalesce(v_count, 0));
end;
$$;

create or replace function public.count_durable_jobs_by_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce(
    (
      select jsonb_object_agg(status, cnt)
      from (
        select status, count(*)::int as cnt
        from public.durable_jobs
        group by status
      ) s
    ),
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.enqueue_durable_job(text, jsonb, text, int, int) from public;
revoke all on function public.claim_durable_jobs(int, text, int) from public;
revoke all on function public.complete_durable_job(uuid) from public;
revoke all on function public.fail_durable_job(uuid, text, int, boolean) from public;
revoke all on function public.recover_stale_durable_jobs(int) from public;
revoke all on function public.count_durable_jobs_by_status() from public;

grant execute on function public.enqueue_durable_job(text, jsonb, text, int, int) to service_role;
grant execute on function public.claim_durable_jobs(int, text, int) to service_role;
grant execute on function public.complete_durable_job(uuid) to service_role;
grant execute on function public.fail_durable_job(uuid, text, int, boolean) to service_role;
grant execute on function public.recover_stale_durable_jobs(int) to service_role;
grant execute on function public.count_durable_jobs_by_status() to service_role;
