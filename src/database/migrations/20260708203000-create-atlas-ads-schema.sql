-- ATLAS Ads — Publicidad externa B2B
-- Propuesta relacional PostgreSQL. No ejecutar en producción sin adaptar enums, permisos, migraciones y naming del backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE ad_advertiser_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name VARCHAR(180) NOT NULL,
  trade_name VARCHAR(120) NOT NULL,
  tax_id VARCHAR(40) NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'BO',
  city VARCHAR(80),
  business_category VARCHAR(80),
  website_url TEXT,
  primary_contact_name VARCHAR(140),
  primary_contact_email VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
  billing_mode VARCHAR(20) NOT NULL DEFAULT 'POSTPAID',
  currency CHAR(3) NOT NULL DEFAULT 'BOB',
  credit_limit_micros BIGINT NOT NULL DEFAULT 0,
  risk_status VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_advertiser_tax UNIQUE(country_code, tax_id),
  CONSTRAINT ck_advertiser_status CHECK (status IN ('PENDING_REVIEW','ACTIVE','SUSPENDED','REJECTED')),
  CONSTRAINT ck_billing_mode CHECK (billing_mode IN ('PREPAID','POSTPAID')),
  CONSTRAINT ck_risk_status CHECK (risk_status IN ('NORMAL','WATCHLIST','BLOCKED'))
);

CREATE TABLE ad_advertiser_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  user_id UUID,
  email VARCHAR(180) NOT NULL,
  role VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_advertiser_user_email UNIQUE(advertiser_id, email),
  CONSTRAINT ck_advertiser_user_role CHECK (role IN ('OWNER','CAMPAIGN_MANAGER','ANALYST','BILLING_VIEWER'))
);

CREATE TABLE ad_billing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  fiscal_name VARCHAR(180) NOT NULL,
  tax_id VARCHAR(40) NOT NULL,
  billing_email VARCHAR(180) NOT NULL,
  address_line TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'BO',
  city VARCHAR(80),
  tax_regime VARCHAR(80),
  sin_customer_code VARCHAR(80),
  is_default BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_billing_profile_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE ad_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  contract_number VARCHAR(80) NOT NULL,
  contract_type VARCHAR(40) NOT NULL DEFAULT 'STANDARD_ADS',
  pricing_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  approved_by UUID,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ad_contract_number UNIQUE(contract_number),
  CONSTRAINT ck_ad_contract_status CHECK (status IN ('DRAFT','ACTIVE','EXPIRED','TERMINATED'))
);

CREATE TABLE ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  name VARCHAR(140) NOT NULL,
  objective VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  approval_status VARCHAR(30) NOT NULL DEFAULT 'NOT_SUBMITTED',
  currency CHAR(3) NOT NULL DEFAULT 'BOB',
  budget_total_micros BIGINT NOT NULL,
  budget_daily_micros BIGINT,
  spend_total_micros BIGINT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_campaign_objective CHECK (objective IN ('AWARENESS','TRAFFIC','LEADS','CONVERSIONS','PROMOTION')),
  CONSTRAINT ck_campaign_status CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','ACTIVE','PAUSED','ENDED','REJECTED','ARCHIVED')),
  CONSTRAINT ck_campaign_approval CHECK (approval_status IN ('NOT_SUBMITTED','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')),
  CONSTRAINT ck_campaign_budget CHECK (budget_total_micros > 0)
);

CREATE TABLE ad_target_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES ad_advertiser_accounts(id),
  name VARCHAR(140) NOT NULL,
  segment_type VARCHAR(40) NOT NULL,
  definition_json JSONB NOT NULL,
  privacy_level VARCHAR(30) NOT NULL DEFAULT 'CORPORATE_CONTEXTUAL',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_segment_type CHECK (segment_type IN ('CORPORATE_CONTEXTUAL','MERCHANT_CATEGORY','GEO','CUSTOM_ALLOWLIST','LOOKUP_STATIC')),
  CONSTRAINT ck_privacy_level CHECK (privacy_level IN ('CORPORATE_CONTEXTUAL','AGGREGATED','HASHED_ALLOWLIST'))
);

CREATE TABLE ad_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id),
  target_segment_id UUID REFERENCES ad_target_segments(id),
  name VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  buying_model VARCHAR(20) NOT NULL,
  bid_amount_micros BIGINT NOT NULL,
  daily_budget_micros BIGINT,
  pacing_strategy VARCHAR(30) NOT NULL DEFAULT 'EVEN',
  frequency_cap_count INT,
  frequency_cap_window_hours INT,
  target_definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_set_buying CHECK (buying_model IN ('CPM','CPC','CPA','FIXED')),
  CONSTRAINT ck_ad_set_status CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','ACTIVE','PAUSED','ENDED','REJECTED','ARCHIVED')),
  CONSTRAINT ck_ad_set_bid CHECK (bid_amount_micros >= 0)
);

CREATE TABLE ad_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  file_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  file_hash VARCHAR(128) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  width_px INT,
  height_px INT,
  duration_seconds NUMERIC(10,2),
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ad_asset_hash UNIQUE(advertiser_id, file_hash)
);

CREATE TABLE ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  name VARCHAR(140) NOT NULL,
  creative_type VARCHAR(30) NOT NULL,
  headline VARCHAR(160),
  body_text TEXT,
  cta_text VARCHAR(60),
  destination_url TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  policy_review_status VARCHAR(30) NOT NULL DEFAULT 'NOT_SUBMITTED',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_creative_type CHECK (creative_type IN ('IMAGE','VIDEO','CAROUSEL','TEXT_CARD')),
  CONSTRAINT ck_creative_status CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','ACTIVE','PAUSED','REJECTED','ARCHIVED')),
  CONSTRAINT ck_creative_policy_status CHECK (policy_review_status IN ('NOT_SUBMITTED','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED'))
);

CREATE TABLE ad_creative_assets (
  creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES ad_assets(id),
  asset_role VARCHAR(30) NOT NULL DEFAULT 'PRIMARY',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (creative_id, asset_id)
);

CREATE TABLE ad_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id UUID NOT NULL REFERENCES ad_ad_sets(id),
  creative_id UUID NOT NULL REFERENCES ad_creatives(id),
  name VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  approval_status VARCHAR(30) NOT NULL DEFAULT 'NOT_SUBMITTED',
  weight INT NOT NULL DEFAULT 1,
  tracking_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_status CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','ACTIVE','PAUSED','ENDED','REJECTED','ARCHIVED')),
  CONSTRAINT ck_ad_approval CHECK (approval_status IN ('NOT_SUBMITTED','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED'))
);

CREATE TABLE ad_inventory_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  surface VARCHAR(80) NOT NULL,
  placement_type VARCHAR(40) NOT NULL,
  allowed_formats_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  billing_model VARCHAR(20) NOT NULL DEFAULT 'CPM',
  width_px INT,
  height_px INT,
  supports_video BOOLEAN NOT NULL DEFAULT false,
  pricing_floor_cpm_micros BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_inventory_billing_model CHECK (billing_model IN ('CPM','CPC','CPA','FIXED'))
);


CREATE TABLE ad_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(80) NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_policy_rule_type CHECK (rule_type IN ('AUTO_REJECT','MANUAL_REVIEW_REQUIRED','WARNING','BLOCK_DELIVERY')),
  CONSTRAINT ck_ad_policy_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL'))
);

CREATE TABLE ad_ad_set_placements (
  ad_set_id UUID NOT NULL REFERENCES ad_ad_sets(id) ON DELETE CASCADE,
  placement_id UUID NOT NULL REFERENCES ad_inventory_placements(id),
  PRIMARY KEY (ad_set_id, placement_id)
);

CREATE TABLE ad_moderation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  campaign_id UUID REFERENCES ad_campaigns(id),
  ad_id UUID REFERENCES ad_ads(id),
  creative_id UUID REFERENCES ad_creatives(id),
  reviewer_user_id UUID,
  decision VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
  reason_code VARCHAR(80),
  notes TEXT,
  requires_advertiser_changes BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_moderation_decision CHECK (decision IN ('PENDING_REVIEW','APPROVED','REJECTED','CHANGES_REQUESTED','ESCALATED'))
);

CREATE TABLE ad_delivery_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  placement_id UUID NOT NULL REFERENCES ad_inventory_placements(id),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id),
  ad_set_id UUID NOT NULL REFERENCES ad_ad_sets(id),
  ad_id UUID NOT NULL REFERENCES ad_ads(id),
  corporate_client_hash VARCHAR(128),
  context_hash VARCHAR(128),
  auction_rank NUMERIC(12,4),
  price_micros BIGINT NOT NULL DEFAULT 0,
  served_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(30) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id UUID,
  delivery_decision_id UUID REFERENCES ad_delivery_decisions(id),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id),
  ad_set_id UUID NOT NULL REFERENCES ad_ad_sets(id),
  ad_id UUID NOT NULL REFERENCES ad_ads(id),
  placement_id UUID REFERENCES ad_inventory_placements(id),
  corporate_client_hash VARCHAR(128),
  session_hash VARCHAR(128),
  ip_hash VARCHAR(128),
  user_agent_hash VARCHAR(128),
  cost_micros BIGINT NOT NULL DEFAULT 0,
  is_billable BOOLEAN NOT NULL DEFAULT false,
  fraud_score NUMERIC(5,4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_ad_event_type CHECK (event_type IN ('IMPRESSION','CLICK','CONVERSION'))
);

CREATE TABLE ad_daily_metrics (
  metric_date DATE NOT NULL,
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  campaign_id UUID REFERENCES ad_campaigns(id),
  ad_set_id UUID REFERENCES ad_ad_sets(id),
  ad_id UUID REFERENCES ad_ads(id),
  placement_id UUID REFERENCES ad_inventory_placements(id),
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  billable_events BIGINT NOT NULL DEFAULT 0,
  spend_micros BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(metric_date, advertiser_id, campaign_id, ad_set_id, ad_id, placement_id)
);

CREATE TABLE ad_spend_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  campaign_id UUID REFERENCES ad_campaigns(id),
  ad_event_id UUID REFERENCES ad_events(id),
  entry_type VARCHAR(30) NOT NULL,
  amount_micros BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BOB',
  reason VARCHAR(120),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT ck_spend_ledger_type CHECK (entry_type IN ('CHARGE','CREDIT','ADJUSTMENT','REFUND','TAX'))
);

CREATE TABLE ad_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES ad_advertiser_accounts(id),
  billing_profile_id UUID NOT NULL REFERENCES ad_billing_profiles(id),
  invoice_number VARCHAR(80) UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BOB',
  subtotal_micros BIGINT NOT NULL DEFAULT 0,
  tax_micros BIGINT NOT NULL DEFAULT 0,
  total_micros BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  sin_cuf VARCHAR(160),
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_invoice_status CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID'))
);

CREATE TABLE ad_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES ad_invoices(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id),
  description TEXT NOT NULL,
  pricing_model VARCHAR(20) NOT NULL,
  quantity NUMERIC(18,4) NOT NULL,
  unit_price_micros BIGINT NOT NULL,
  amount_micros BIGINT NOT NULL,
  CONSTRAINT ck_invoice_pricing_model CHECK (pricing_model IN ('CPM','CPC','CPA','FIXED','ADJUSTMENT'))
);

CREATE TABLE ad_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES ad_invoices(id),
  amount_micros BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BOB',
  payment_method VARCHAR(40),
  external_reference VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_type VARCHAR(40) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(80) NOT NULL,
  reason TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
  before_json JSONB,
  after_json JSONB,
  request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_audit_severity CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL'))
);

-- Índices principales
CREATE INDEX idx_ad_policy_rules_active ON ad_policy_rules(is_active, category);
CREATE INDEX idx_ad_campaigns_advertiser_status ON ad_campaigns(advertiser_id, status);
CREATE INDEX idx_ad_sets_campaign_status ON ad_ad_sets(campaign_id, status);
CREATE INDEX idx_ad_ads_adset_status ON ad_ads(ad_set_id, status);
CREATE INDEX idx_ad_events_time ON ad_events(event_time);
CREATE INDEX idx_ad_events_campaign_time ON ad_events(campaign_id, event_time);
CREATE INDEX idx_ad_events_billable ON ad_events(is_billable, event_time);
CREATE UNIQUE INDEX uq_ad_event_tracking_idempotency ON ad_events(delivery_decision_id, event_type, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_ad_spend_ledger_advertiser_time ON ad_spend_ledger(advertiser_id, occurred_at);
CREATE UNIQUE INDEX uq_ad_spend_ledger_event_charge ON ad_spend_ledger(ad_event_id) WHERE ad_event_id IS NOT NULL;
CREATE INDEX idx_ad_invoices_advertiser_period ON ad_invoices(advertiser_id, period_start, period_end);
CREATE UNIQUE INDEX uq_ad_invoice_open_period ON ad_invoices(advertiser_id, currency, period_start, period_end) WHERE status <> 'VOID';
CREATE INDEX idx_ad_audit_entity ON ad_audit_log(entity_type, entity_id, created_at);
CREATE INDEX idx_ad_audit_actor_time ON ad_audit_log(actor_user_id, created_at);
