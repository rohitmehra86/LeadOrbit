-- Durable friend-demo orgs on LeadOrbit Supabase (kqmuxocbmtydkxdvmypy).
-- Password for both users: DemoFriend-Vercel-2026!
-- Re-run safely in Supabase SQL editor (service role). Not Linkbook.

do $$
declare
  v_mkt_user uuid := '11111111-1111-4111-8111-111111111111';
  v_bro_user uuid := '22222222-2222-4222-8222-222222222222';
  v_mkt_org uuid := '33333333-3333-4333-8333-333333333333';
  v_bro_org uuid := '44444444-4444-4444-8444-444444444444';
  v_camp uuid := '55555555-5555-4555-8555-555555555555';
  v_form uuid := '66666666-6666-4666-8666-666666666666';
  v_page uuid := '77777777-7777-4777-8777-777777777777';
  v_dev uuid := '88888888-8888-4888-8888-888888888888';
  v_proj uuid := '99999999-9999-4999-8999-999999999999';
  v_prop uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_lead uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_pref uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_enq uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_type uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_pipe uuid;
  v_stage uuid;
  v_pw text := crypt('DemoFriend-Vercel-2026!', gen_salt('bf'));
  v_fields jsonb := '[{"id":"f1","key":"fullName","label":"Full name","type":"text","required":true,"options":[],"placeholder":"Jordan Lee","showWhen":null,"step":0,"position":0,"crmMapTo":"fullName","customCrmKey":null},{"id":"f2","key":"email","label":"Work email","type":"email","required":true,"options":[],"placeholder":"you@company.com","showWhen":null,"step":0,"position":1,"crmMapTo":"email","customCrmKey":null},{"id":"f3","key":"phone","label":"Phone","type":"phone","required":false,"options":[],"placeholder":"+1…","showWhen":null,"step":0,"position":2,"crmMapTo":"phone","customCrmKey":null},{"id":"f4","key":"budget","label":"Budget range","type":"select","required":false,"options":["Under $500k","$500k–$1M","$1M+"],"placeholder":null,"showWhen":null,"step":1,"position":0,"crmMapTo":"custom","customCrmKey":"budget"},{"id":"f5","key":"consent","label":"I agree to be contacted","type":"consent","required":true,"options":[],"placeholder":null,"showWhen":null,"step":1,"position":1,"crmMapTo":null,"customCrmKey":null}]'::jsonb;
  v_doc jsonb := '{"version":1,"seo":{"title":"Generate qualified inbound leads","description":"Tell us your budget and timeline","ogImage":null},"consentNotice":"By continuing you agree to our privacy notice.","blocks":[{"id":"hero","type":"hero","props":{"headline":"Generate qualified inbound leads","subheadline":"Tell us your budget, location, and timeline — we will follow up fast.","ctaLabel":"Get details"}},{"id":"form","type":"form","props":{"heading":"Share your details"}}]}'::jsonb;
begin
  delete from public.organizations where id in (v_mkt_org, v_bro_org);
  delete from auth.identities where user_id in (v_mkt_user, v_bro_user);
  delete from auth.users where id in (v_mkt_user, v_bro_user);
  delete from auth.users where email in ('marketing.friend@test.com','broker.friend@test.com');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values
  ('00000000-0000-0000-0000-000000000000', v_mkt_user, 'authenticated', 'authenticated',
   'marketing.friend@test.com', v_pw, now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Marketing Friend"}'::jsonb, now(), now(),
   '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', v_bro_user, 'authenticated', 'authenticated',
   'broker.friend@test.com', v_pw, now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Broker Friend"}'::jsonb, now(), now(),
   '', '', '', '', false, false);

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
  (gen_random_uuid(), v_mkt_user::text, v_mkt_user,
   jsonb_build_object('sub', v_mkt_user::text, 'email', 'marketing.friend@test.com', 'email_verified', true),
   'email', now(), now(), now()),
  (gen_random_uuid(), v_bro_user::text, v_bro_user,
   jsonb_build_object('sub', v_bro_user::text, 'email', 'broker.friend@test.com', 'email_verified', true),
   'email', now(), now(), now());

  update public.profiles set full_name = 'Marketing Friend', email = 'marketing.friend@test.com' where id = v_mkt_user;
  update public.profiles set full_name = 'Broker Friend', email = 'broker.friend@test.com' where id = v_bro_user;

  insert into public.organizations (id, name, slug, org_type, timezone, locale, currency, branding)
  values
  (v_mkt_org, 'Marketing Friend Agency', 'marketing-friend-agency', 'agency', 'Asia/Kolkata', 'en-IN', 'INR', '{}'::jsonb),
  (v_bro_org, 'Broker Friend Realty', 'broker-friend-realty', 'workspace', 'Asia/Kolkata', 'en-IN', 'INR', '{}'::jsonb);

  insert into public.memberships (org_id, user_id, role, status)
  values
  (v_mkt_org, v_mkt_user, 'owner', 'active'),
  (v_bro_org, v_bro_user, 'owner', 'active');

  insert into public.campaigns (
    id, org_id, name, objective, status, audience, ad_copy, utm, budget,
    ab_test_enabled, ab_variants, attribution_model, template_key
  ) values (
    v_camp, v_mkt_org, 'Generate qualified inbound leads', 'lead_gen', 'active',
    '{"segments":[],"territories":[],"notes":"Friend demo Launch Pack"}'::jsonb,
    'Generate qualified inbound leads. Talk to our team — share your budget and timeline.',
    '{"utmSource":"leadorbit","utmMedium":"launch_pack","utmCampaign":"generate-qualified-inbound-leads"}'::jsonb,
    '{"currency":"INR","dailyCents":null,"totalCents":null}'::jsonb,
    false, '[]'::jsonb, 'last_touch', 'lead_gen'
  );

  insert into public.forms (
    id, org_id, campaign_id, name, status, fields, multi_step, spam_honeypot_enabled,
    duplicate_detection, consent_text, embed_enabled, version, template_key, thank_you_message
  ) values (
    v_form, v_mkt_org, v_camp, 'Generate qualified inbound leads — Capture', 'published',
    v_fields, true, true, true, 'I agree to be contacted about this offer.', true, 1, 'lead_gen',
    'Thanks — we will be in touch shortly.'
  );

  insert into public.landing_pages (
    id, org_id, campaign_id, form_id, name, slug, status, document, template_key, version, published_at
  ) values (
    v_page, v_mkt_org, v_camp, v_form, 'Generate qualified inbound leads', 'launch-friend-demo',
    'published', v_doc, 'lead_gen', 1, now()
  );

  update public.campaigns set form_id = v_form, landing_page_id = v_page where id = v_camp;

  perform public.ensure_org_pipelines(v_mkt_org);
  select id into v_pipe from public.pipelines where org_id = v_mkt_org and kind = 'lead' limit 1;
  select id into v_stage from public.pipeline_stages where org_id = v_mkt_org and pipeline_id = v_pipe order by position limit 1;

  insert into public.leads (
    org_id, email, phone, full_name, source, status, lifecycle_stage, score,
    owner_user_id, territory, pipeline_id, stage_id, custom_fields, sla_state
  ) values
  (v_mkt_org, 'priya.demo@example.com', '+919800000001', 'Priya Nair', 'form', 'new', 'lead', 40,
   v_mkt_user, 'Bangalore', v_pipe, v_stage, '{}'::jsonb, 'ok'),
  (v_mkt_org, 'arjun.demo@example.com', '+919800000002', 'Arjun Mehta', 'manual', 'new', 'lead', 35,
   v_mkt_user, 'Mumbai', v_pipe, v_stage, '{}'::jsonb, 'ok');

  insert into public.org_vertical_modules (org_id, module_key, enabled, config)
  values (v_bro_org, 'real_estate', true, '{}'::jsonb);
  insert into public.org_industry_templates (org_id, template_id, selected, config)
  values (v_bro_org, 'real_estate', true, '{}'::jsonb);

  insert into public.re_developers (id, org_id, name, website)
  values (v_dev, v_bro_org, 'Horizon Developers', 'https://example.com');

  insert into public.re_projects (id, org_id, developer_id, name, location, city, status, amenities)
  values (v_proj, v_bro_org, v_dev, 'Green Park Residences', 'Whitefield', 'Bangalore', 'under_construction',
          '["pool","gym","clubhouse"]'::jsonb);

  insert into public.re_properties (id, org_id, project_id, name, property_type, address)
  values (v_prop, v_bro_org, v_proj, 'Tower A', 'apartment', 'Whitefield, Bangalore');

  insert into public.re_units (org_id, project_id, property_id, unit_number, floor, bhk, price, currency, status, facing, amenities)
  values
  (v_bro_org, v_proj, v_prop, 'A-1201', 12, 3, 12000000, 'INR', 'available', 'east', '["gym"]'::jsonb),
  (v_bro_org, v_proj, v_prop, 'A-805', 8, 2, 8500000, 'INR', 'available', 'east', '["gym"]'::jsonb),
  (v_bro_org, v_proj, v_prop, 'A-402', 4, 2, 8200000, 'INR', 'available', 'east', '["gym"]'::jsonb);

  perform public.ensure_org_pipelines(v_bro_org);
  select id into v_pipe from public.pipelines where org_id = v_bro_org and kind = 'lead' limit 1;
  select id into v_stage from public.pipeline_stages where org_id = v_bro_org and pipeline_id = v_pipe order by position limit 1;

  insert into public.leads (
    id, org_id, email, phone, full_name, source, status, lifecycle_stage, score,
    owner_user_id, territory, pipeline_id, stage_id, custom_fields, sla_state
  ) values (
    v_lead, v_bro_org, 'sneha.buyer@example.com', '+919811122233', 'Sneha Rao', 'referral', 'new', 'lead', 55,
    v_bro_user, 'Bangalore', v_pipe, v_stage, '{}'::jsonb, 'ok'
  );

  insert into public.re_buyer_preferences (
    id, org_id, lead_id, budget_min, budget_max, locations, bhk_min, bhk_max, property_types, must_have_amenities
  ) values (
    v_pref, v_bro_org, v_lead, 7000000, 13000000, '["Whitefield","Bangalore"]'::jsonb, 2, 3, '[]'::jsonb, '["gym"]'::jsonb
  );

  insert into public.re_enquiries (
    id, org_id, lead_id, project_id, assignee_user_id, status, source, message, preference_id
  ) values (
    v_enq, v_bro_org, v_lead, v_proj, v_bro_user, 'matched', 'demo_seed',
    'Looking for 2–3 BHK in Whitefield for family', v_pref
  );

  insert into public.appointment_types (
    id, org_id, name, kind, duration_minutes, requires_site_visit, timezone, active
  ) values (
    v_type, v_bro_org, 'Site visit', 'site_visit', 60, true, 'Asia/Kolkata', true
  );
end $$;
