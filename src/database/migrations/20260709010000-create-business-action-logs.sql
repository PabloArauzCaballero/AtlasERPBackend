CREATE SCHEMA IF NOT EXISTS atlas_audit;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS atlas_audit.business_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code VARCHAR(80) NOT NULL,
  business_process VARCHAR(120) NOT NULL,
  action_code VARCHAR(120) NOT NULL,
  actor_user_id UUID NULL,
  actor_role VARCHAR(120) NULL,
  aggregate_type VARCHAR(120) NULL,
  aggregate_id VARCHAR(120) NULL,
  correlation_id VARCHAR(160) NULL,
  request_id VARCHAR(160) NULL,
  source_system VARCHAR(80) NOT NULL DEFAULT 'ATLAS',
  affected_tables VARCHAR(120)[] NOT NULL,
  affected_record_count INTEGER NOT NULL CHECK (affected_record_count >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL')),
  input_summary JSONB NULL,
  output_summary JSONB NULL,
  error_code VARCHAR(120) NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_action_logs_module_created
  ON atlas_audit.business_action_logs (module_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_action_logs_process_created
  ON atlas_audit.business_action_logs (business_process, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_action_logs_aggregate
  ON atlas_audit.business_action_logs (aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS idx_business_action_logs_correlation
  ON atlas_audit.business_action_logs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_business_action_logs_actor_created
  ON atlas_audit.business_action_logs (actor_user_id, created_at DESC);
