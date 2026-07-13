CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ad_email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_reference VARCHAR(120),
  subject VARCHAR(500) NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id VARCHAR(180),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_email_message_status CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED'))
);
CREATE INDEX IF NOT EXISTS ix_ad_email_messages_due ON ad_email_messages(status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_ad_email_messages_tracking ON ad_email_messages(tracking_id);

CREATE TABLE IF NOT EXISTS ad_email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized VARCHAR(255) NOT NULL UNIQUE,
  reason VARCHAR(40) NOT NULL,
  details TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
