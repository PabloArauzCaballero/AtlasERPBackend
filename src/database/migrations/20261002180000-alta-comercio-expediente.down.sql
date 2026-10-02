-- Reversa de 20261002180000-alta-comercio-expediente.sql
--
-- NO destruye lo capturado: si alguna cuenta ya guarda matrícula, representante o QR, la reversa se
-- NIEGA y no toca nada (quitar las columnas borraría lo que el comercio entregó una sola vez).
-- Sólo sirve en una base descartable o antes de que se haya capturado el primer expediente.

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM atlas_sales.b2b_accounts
        WHERE commercial_registry IS NOT NULL
           OR legal_rep_full_name IS NOT NULL
           OR power_of_attorney_file_id IS NOT NULL
           OR bank_qr_file_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'B2B_ACCOUNT_DOSSIER_DATA_PRESENT: hay cuentas con datos del expediente; la reversa no los destruye.';
  END IF;
END $$;

ALTER TABLE atlas_sales.b2b_accounts
  DROP CONSTRAINT IF EXISTS ck_b2b_accounts_legal_rep_document_type,
  DROP COLUMN IF EXISTS bank_account_masked,
  DROP COLUMN IF EXISTS bank_institution_code,
  DROP COLUMN IF EXISTS bank_qr_file_id,
  DROP COLUMN IF EXISTS power_of_attorney_file_id,
  DROP COLUMN IF EXISTS legal_rep_document_number,
  DROP COLUMN IF EXISTS legal_rep_document_type,
  DROP COLUMN IF EXISTS legal_rep_full_name,
  DROP COLUMN IF EXISTS commercial_registry;
