-- Harden Meta OAuth tables: no client access to ciphertext / pending tokens.
-- LeadOrbit project only (kqmuxocbmtydkxdvmypy).

revoke all on table public.meta_ad_connections from anon, authenticated;
revoke all on table public.meta_oauth_pending from anon, authenticated;

-- Metadata only for org members (ciphertext column not granted).
grant select (
  id, org_id, status, ad_account_id, page_id, token_expires_at,
  connected_at, connected_by_user_id, last_error, created_at, updated_at
) on public.meta_ad_connections to authenticated;

drop policy if exists meta_oauth_pending_member_select on public.meta_oauth_pending;

-- Ensure member metadata select policy exists (idempotent with 00017).
drop policy if exists meta_ad_connections_member_select on public.meta_ad_connections;
create policy meta_ad_connections_member_select on public.meta_ad_connections
  for select using (private.is_org_member(org_id));
