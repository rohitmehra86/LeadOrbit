-- Production billing: seed plans, checkout lookup index, atomic webhook apply.
-- Webhook writes use security definer (service_role) — anon/authenticated cannot forge activations.

insert into public.billing_plans (
  code, name, interval, price_cents, currency,
  seats_included, ai_credits_included, features, active
) values
  (
    'trial', 'Trial', 'monthly', 0, 'USD', 3, 500,
    '{"crm":true,"campaigns":true,"workflows":true,"inbox":true,"ai":true,"analytics":true,"white_label":false,"real_estate":false,"voice":false}'::jsonb,
    true
  ),
  (
    'starter_monthly', 'Starter', 'monthly', 4900, 'USD', 5, 2000,
    '{"crm":true,"campaigns":true,"workflows":true,"inbox":true,"ai":true,"analytics":true,"white_label":false,"real_estate":true,"voice":false}'::jsonb,
    true
  ),
  (
    'growth_monthly', 'Growth', 'monthly', 14900, 'USD', 20, 10000,
    '{"crm":true,"campaigns":true,"workflows":true,"inbox":true,"ai":true,"analytics":true,"white_label":true,"real_estate":true,"voice":true}'::jsonb,
    true
  ),
  (
    'growth_annual', 'Growth (Annual)', 'annual', 149000, 'USD', 20, 120000,
    '{"crm":true,"campaigns":true,"workflows":true,"inbox":true,"ai":true,"analytics":true,"white_label":true,"real_estate":true,"voice":true}'::jsonb,
    true
  )
on conflict (code) do update set
  name = excluded.name,
  interval = excluded.interval,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  seats_included = excluded.seats_included,
  ai_credits_included = excluded.ai_credits_included,
  features = excluded.features,
  active = excluded.active;

-- Lookup checkout/payment references created before the webhook arrives.
create unique index if not exists billing_invoices_provider_ref_uidx
  on public.billing_invoices (provider, provider_invoice_id)
  where provider_invoice_id is not null and length(trim(provider_invoice_id)) > 0;

/**
 * Atomically record a verified webhook and optionally activate/fail a subscription.
 * Caller must have already verified the provider signature in the application.
 * Org association prefers a stored checkout invoice over a bare metadata claim.
 */
create or replace function public.apply_billing_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_claimed_org_id uuid default null,
  p_provider_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.billing_webhook_events%rowtype;
  v_org_id uuid;
  v_sub public.org_subscriptions%rowtype;
  v_detail text := 'ok';
  v_duplicate boolean := false;
  v_wh_id uuid;
  v_grace timestamptz;
begin
  if p_provider not in ('stripe', 'razorpay') then
    raise exception 'unsupported provider' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_event_id), ''), '') is null then
    raise exception 'event id required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.billing_webhook_events
  where provider = p_provider and event_id = p_event_id;

  if found then
    v_duplicate := true;
    v_org_id := v_existing.org_id;
    v_detail := 'Webhook already processed (idempotent)';
  else
    -- Prefer checkout/payment reference recorded at startCheckout.
    if coalesce(nullif(trim(p_provider_ref), ''), '') is not null then
      select i.org_id into v_org_id
      from public.billing_invoices i
      where i.provider = p_provider
        and i.provider_invoice_id = p_provider_ref
      order by i.created_at desc
      limit 1;
    end if;

    -- Claimed org is accepted only when a matching open invoice or in-flight subscription exists.
    if v_org_id is null and p_claimed_org_id is not null then
      if exists (
        select 1 from public.billing_invoices i
        where i.org_id = p_claimed_org_id
          and i.provider = p_provider
          and i.status in ('open', 'pending_configuration')
      ) or exists (
        select 1 from public.org_subscriptions s
        where s.org_id = p_claimed_org_id
          and s.provider = p_provider
          and s.status in ('incomplete', 'trialing', 'past_due', 'grace')
      ) then
        v_org_id := p_claimed_org_id;
      else
        v_detail := 'claimed orgId has no matching checkout or in-flight subscription';
      end if;
    end if;

    if v_org_id is null and coalesce(nullif(trim(p_provider_ref), ''), '') is null
       and p_claimed_org_id is null then
      v_detail := 'webhook has no org association';
    elsif v_org_id is null and coalesce(nullif(trim(p_provider_ref), ''), '') is not null then
      v_detail := 'provider reference did not match a stored checkout';
    end if;

    insert into public.billing_webhook_events (
      provider, event_id, event_type, org_id, processed, detail
    ) values (
      p_provider, p_event_id, p_event_type, v_org_id, true, v_detail
    )
    returning id into v_wh_id;

    if v_org_id is not null then
      select * into v_sub from public.org_subscriptions where org_id = v_org_id;
      if not found then
        insert into public.org_subscriptions (
          org_id, plan_code, status, interval, seats_included, seats_used,
          ai_credits_included, ai_credits_used, usage_quotas, features,
          trial_ends_at, current_period_start, current_period_end,
          cancel_at_period_end, provider
        )
        select
          v_org_id,
          p.code,
          'incomplete',
          p.interval,
          p.seats_included,
          1,
          p.ai_credits_included,
          0,
          '{}'::jsonb,
          p.features,
          null,
          now(),
          now() + interval '30 days',
          false,
          p_provider
        from public.billing_plans p
        where p.code = 'trial'
        limit 1
        returning * into v_sub;
      end if;

      if lower(p_event_type) like '%invoice.paid%'
         or lower(p_event_type) like '%payment.captured%'
         or lower(p_event_type) like '%subscription.activated%'
         or lower(p_event_type) like '%checkout.session.completed%' then
        update public.org_subscriptions
        set status = 'active',
            cancel_at_period_end = false,
            grace_ends_at = null,
            provider = p_provider,
            updated_at = now()
        where org_id = v_org_id;

        update public.billing_invoices
        set status = 'paid', paid_at = now()
        where org_id = v_org_id
          and status in ('open', 'pending_configuration')
          and (
            p_provider_ref is null
            or provider_invoice_id = p_provider_ref
            or provider_invoice_id is null
          );

        v_detail := 'activated';
      elsif lower(p_event_type) like '%invoice.payment_failed%'
            or lower(p_event_type) like '%payment.failed%' then
        v_grace := now() + interval '7 days';
        update public.org_subscriptions
        set status = 'past_due',
            grace_ends_at = v_grace,
            updated_at = now()
        where org_id = v_org_id;
        v_detail := 'past_due';
      elsif lower(p_event_type) like '%customer.subscription.deleted%'
            or lower(p_event_type) like '%subscription.cancelled%' then
        update public.org_subscriptions
        set status = 'canceled', updated_at = now()
        where org_id = v_org_id;
        v_detail := 'canceled';
      else
        v_detail := 'recorded without status change';
      end if;

      update public.billing_webhook_events
      set detail = v_detail, org_id = v_org_id
      where id = v_wh_id;
    end if;
  end if;

  select * into v_sub from public.org_subscriptions where org_id = v_org_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', v_duplicate,
    'detail', v_detail,
    'orgId', v_org_id,
    'subscription', case
      when v_sub.id is null then null
      else jsonb_build_object(
        'id', v_sub.id,
        'orgId', v_sub.org_id,
        'planCode', v_sub.plan_code,
        'status', v_sub.status,
        'interval', v_sub.interval,
        'seatsIncluded', v_sub.seats_included,
        'seatsUsed', v_sub.seats_used,
        'aiCreditsIncluded', v_sub.ai_credits_included,
        'aiCreditsUsed', v_sub.ai_credits_used,
        'usageQuotas', v_sub.usage_quotas,
        'features', v_sub.features,
        'trialEndsAt', v_sub.trial_ends_at,
        'currentPeriodStart', v_sub.current_period_start,
        'currentPeriodEnd', v_sub.current_period_end,
        'cancelAtPeriodEnd', v_sub.cancel_at_period_end,
        'graceEndsAt', v_sub.grace_ends_at,
        'provider', v_sub.provider,
        'providerCustomerId', v_sub.provider_customer_id,
        'providerSubscriptionId', v_sub.provider_subscription_id,
        'createdAt', v_sub.created_at,
        'updatedAt', v_sub.updated_at
      )
    end
  );
exception
  when unique_violation then
    -- Concurrent insert of the same event — treat as duplicate.
    select * into v_existing
    from public.billing_webhook_events
    where provider = p_provider and event_id = p_event_id;
    select * into v_sub from public.org_subscriptions where org_id = v_existing.org_id;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'detail', 'Webhook already processed (idempotent)',
      'orgId', v_existing.org_id,
      'subscription', case
        when v_sub.id is null then null
        else jsonb_build_object(
          'id', v_sub.id,
          'orgId', v_sub.org_id,
          'planCode', v_sub.plan_code,
          'status', v_sub.status,
          'interval', v_sub.interval,
          'seatsIncluded', v_sub.seats_included,
          'seatsUsed', v_sub.seats_used,
          'aiCreditsIncluded', v_sub.ai_credits_included,
          'aiCreditsUsed', v_sub.ai_credits_used,
          'usageQuotas', v_sub.usage_quotas,
          'features', v_sub.features,
          'trialEndsAt', v_sub.trial_ends_at,
          'currentPeriodStart', v_sub.current_period_start,
          'currentPeriodEnd', v_sub.current_period_end,
          'cancelAtPeriodEnd', v_sub.cancel_at_period_end,
          'graceEndsAt', v_sub.grace_ends_at,
          'provider', v_sub.provider,
          'providerCustomerId', v_sub.provider_customer_id,
          'providerSubscriptionId', v_sub.provider_subscription_id,
          'createdAt', v_sub.created_at,
          'updatedAt', v_sub.updated_at
        )
      end
    );
end;
$$;

revoke all on function public.apply_billing_webhook(text, text, text, uuid, text) from public;
grant execute on function public.apply_billing_webhook(text, text, text, uuid, text)
  to service_role;
