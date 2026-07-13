INSERT INTO ad_inventory_placements (
  code, surface, placement_type, allowed_formats_json, billing_model, width_px, height_px,
  supports_video, pricing_floor_cpm_micros, is_active
) VALUES
  ('MERCHANT_DASHBOARD_TOP_BANNER', 'MERCHANT_PORTAL', 'IMAGE_BANNER', '["IMAGE_BANNER"]'::jsonb, 'CPM', 1200, 250, false, 2500000, true),
  ('MERCHANT_PORTAL_SIDE_CARD', 'MERCHANT_PORTAL', 'TEXT_CARD', '["TEXT_CARD","IMAGE_BANNER"]'::jsonb, 'CPC', 360, 280, false, 1500000, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ad_policy_rules (
  policy_code, category, rule_type, severity, description, is_active
) VALUES
  ('NO_UNVERIFIED_FINANCIAL_CLAIMS', 'FINANCIAL_CLAIMS', 'MANUAL_REVIEW_REQUIRED', 'HIGH', 'No permitir promesas financieras, crédito, inversión o rentabilidad sin evidencia verificable y revisión de compliance.', true),
  ('NO_SENSITIVE_TARGETING', 'PRIVACY', 'AUTO_REJECT', 'CRITICAL', 'Rechazar campañas que usen segmentación sensible o datos personales no autorizados.', true)
ON CONFLICT (policy_code) DO NOTHING;
