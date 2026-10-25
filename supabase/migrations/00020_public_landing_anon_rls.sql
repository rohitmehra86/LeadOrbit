-- Public landing pages and forms are read by the anon key.
-- Member policies were FOR ALL with no role, so Postgres also evaluated
-- private.is_org_member for anon. That function is executable only by
-- authenticated, so every public SELECT failed with permission denied and
-- the Next.js page returned a server error instead of the listing.
--
-- Keep member access for signed-in users. Anon uses the published-only
-- SELECT policies from 00013.

drop policy if exists landing_pages_member_all on public.landing_pages;
create policy landing_pages_member_all on public.landing_pages
  for all
  to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));

drop policy if exists forms_member_all on public.forms;
create policy forms_member_all on public.forms
  for all
  to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));
