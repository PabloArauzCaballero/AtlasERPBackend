-- P-07 (2026-09-24) · La compra BNPL guarda la tasa MDR con la que se le cobró.
--
-- `bnpl_purchases.contract_version_id` ya dice qué versión contractual regía al comprar, pero las
-- reglas MDR de esa versión se pueden EDITAR en sitio (`PATCH /b2b/.../mdr-rules/:id`): con sólo el
-- id de la versión, la comisión de una compra antigua no se puede reconstruir ni auditar. Se guarda
-- la tasa aplicada, el importe, la regla y de dónde salió (regla MDR o término comercial).
-- Columnas aditivas y NULLABLE: las compras anteriores quedan como estaban (sin inventar su tasa).
ALTER TABLE atlas_sales.bnpl_purchases
  ADD COLUMN IF NOT EXISTS mdr_rate_percent numeric(9,6),
  ADD COLUMN IF NOT EXISTS mdr_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS mdr_rule_id uuid,
  ADD COLUMN IF NOT EXISTS mdr_pricing_source varchar(40);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bnpl_purchases_mdr_snapshot'
  ) THEN
    ALTER TABLE atlas_sales.bnpl_purchases
      ADD CONSTRAINT ck_bnpl_purchases_mdr_snapshot CHECK (
        (mdr_rate_percent IS NULL OR (mdr_rate_percent >= 0 AND mdr_rate_percent <= 100))
        AND (mdr_amount IS NULL OR mdr_amount >= 0)
        AND (mdr_pricing_source IS NULL OR mdr_pricing_source IN ('mdr_rules', 'commercial_terms'))
      );
  END IF;
END $$;
