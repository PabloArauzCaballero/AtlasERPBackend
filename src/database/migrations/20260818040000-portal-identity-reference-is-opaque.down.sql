-- Reversa: vuelve a `uuid`. Sólo es posible si ningún identificador guardado dejó de ser un UUID
-- (por ejemplo, si ya entraron identidades de AtlasBackend, que son numéricas). En ese caso el
-- USING falla y la reversa se detiene, que es lo correcto: revertir destruiría esos enlaces.
ALTER TABLE atlas_sales.merchant_users
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE ad_advertiser_users
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
