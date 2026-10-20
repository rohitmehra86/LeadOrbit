-- Milestone staging: profile bootstrap + first-org create under RLS

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', null)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- First membership insert is blocked by memberships_insert_admin (chicken/egg).
-- Provide a security-definer RPC that creates org + owner membership atomically.
create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text,
  p_org_type text default 'workspace',
  p_timezone text default 'UTC',
  p_locale text default 'en-US',
  p_currency text default 'USD'
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
  v_slug text := trim(both from p_slug);
  v_name text := trim(both from p_name);
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'organization name too short' using errcode = '22023';
  end if;
  if v_slug is null or char_length(v_slug) < 2 then
    v_slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;
  if p_org_type not in ('agency', 'workspace') then
    raise exception 'invalid org_type' using errcode = '22023';
  end if;

  -- Ensure profile row exists (trigger may race on first request).
  insert into public.profiles (id, email, full_name)
  select v_uid, coalesce(u.email, ''), coalesce(u.raw_user_meta_data->>'full_name', null)
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  insert into public.organizations (
    name, slug, org_type, timezone, locale, currency
  ) values (
    v_name,
    v_slug,
    p_org_type,
    coalesce(nullif(trim(p_timezone), ''), 'UTC'),
    coalesce(nullif(trim(p_locale), ''), 'en-US'),
    upper(substr(coalesce(nullif(trim(p_currency), ''), 'USD'), 1, 3))
  )
  returning * into v_org;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_org.id, v_uid, 'owner', 'active');

  return v_org;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text, text, text, text, text) from public;
grant execute on function public.create_organization_with_owner(text, text, text, text, text, text) to authenticated;

-- Allow first platform admin bootstrap when table is empty (staging convenience).
create or replace function public.maybe_bootstrap_platform_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return false;
  end if;
  select count(*)::int into v_count from public.platform_admins;
  if v_count > 0 then
    return exists (select 1 from public.platform_admins where user_id = v_uid);
  end if;
  insert into public.profiles (id, email, full_name)
  select v_uid, coalesce(u.email, ''), coalesce(u.raw_user_meta_data->>'full_name', null)
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;
  insert into public.platform_admins (user_id, note)
  values (v_uid, 'auto-bootstrap first user')
  on conflict (user_id) do nothing;
  return true;
end;
$$;

revoke all on function public.maybe_bootstrap_platform_admin() from public;
grant execute on function public.maybe_bootstrap_platform_admin() to authenticated;
