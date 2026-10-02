-- Retira la política sólo si nadie calificó con ella: una calificación emitida referencia su versión.
DELETE FROM atlas_sales.rating_policy_versions v
WHERE v.id = '00000000-0000-4000-8000-000000000101'
  AND NOT EXISTS (SELECT 1 FROM atlas_sales.receivable_risk_ratings r WHERE r.policy_version_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM atlas_sales.b2b_account_risk_ratings c WHERE c.policy_version_id = v.id);
