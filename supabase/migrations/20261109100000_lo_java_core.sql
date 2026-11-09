-- LeadOrbit Java app tables (isolated from legacy Next.js CRM schema)
CREATE TABLE IF NOT EXISTS lo_orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lo_meta_connections (
  org_id TEXT PRIMARY KEY REFERENCES lo_orgs(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  ad_account_id TEXT,
  page_id TEXT,
  pixel_id TEXT,
  lead_gen_form_id TEXT,
  token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lo_meta_oauth_pending (
  nonce TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES lo_orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lo_landing_pages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES lo_orgs(id) ON DELETE CASCADE,
  campaign_id TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  headline TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS lo_leads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES lo_orgs(id) ON DELETE CASCADE,
  campaign_id TEXT,
  page_id TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'landing_page',
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lo_leads_org_created_idx ON lo_leads (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lo_meta_launch_plans (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES lo_orgs(id) ON DELETE CASCADE,
  local_campaign_id TEXT,
  name TEXT NOT NULL,
  geo TEXT,
  budget_amount NUMERIC(12,2),
  currency TEXT,
  primary_text TEXT,
  headline TEXT,
  landing_page_url TEXT,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lo_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lo_meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lo_meta_oauth_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE lo_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lo_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lo_meta_launch_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lo_landing_pages_public_read ON lo_landing_pages;
CREATE POLICY lo_landing_pages_public_read ON lo_landing_pages
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS lo_leads_public_insert ON lo_leads;
CREATE POLICY lo_leads_public_insert ON lo_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

INSERT INTO lo_orgs (id, name)
VALUES ('33333333-3333-4333-8333-333333333333', 'Demo Org')
ON CONFLICT (id) DO NOTHING;
