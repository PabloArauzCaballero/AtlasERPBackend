-- Archivado (soft-delete reversible) de cuentas B2B.
-- Una cuenta comercial no se borra: se archiva. Sale de los listados operativos pero sigue
-- siendo consultable y auditable, y sus contratos/facturas mantienen la referencia intacta.
-- Idempotente: se puede re-ejecutar sin efecto.
ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_b2b_accounts_archived
  ON atlas_sales.b2b_accounts(archived_at);
