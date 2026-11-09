CREATE TABLE IF NOT EXISTS lo_orgs (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lo_meta_connections (
  org_id VARCHAR(64) PRIMARY KEY,
  access_token CLOB NOT NULL,
  ad_account_id VARCHAR(64),
  page_id VARCHAR(64),
  pixel_id VARCHAR(64),
  lead_gen_form_id VARCHAR(64),
  token_expires_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lo_meta_oauth_pending (
  nonce VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  access_token CLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lo_landing_pages (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(64),
  slug VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  headline VARCHAR(512),
  body_text CLOB,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS lo_leads (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(64),
  page_id VARCHAR(64),
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(64),
  source VARCHAR(64) DEFAULT 'landing_page',
  payload CLOB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lo_meta_launch_plans (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  local_campaign_id VARCHAR(64),
  name VARCHAR(255) NOT NULL,
  geo VARCHAR(255),
  budget_amount DECIMAL(12, 2),
  currency VARCHAR(8),
  primary_text CLOB,
  headline VARCHAR(512),
  landing_page_url VARCHAR(1024),
  meta_campaign_id VARCHAR(64),
  meta_adset_id VARCHAR(64),
  meta_ad_id VARCHAR(64),
  status VARCHAR(64) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO lo_orgs (id, name)
SELECT '33333333-3333-4333-8333-333333333333', 'Demo Org'
WHERE NOT EXISTS (
  SELECT 1 FROM lo_orgs WHERE id = '33333333-3333-4333-8333-333333333333'
);
