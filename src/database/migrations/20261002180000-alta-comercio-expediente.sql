-- =====================================================================================
-- Cuenta B2B: lo que el expediente del comercio exige, capturado UNA vez en el alta del ERP
-- =====================================================================================
--
-- Hasta aquí el ERP abría el expediente del comercio en AtlasBackend con seis campos (razón social,
-- nombre comercial, NIT, correo, teléfono, cuenta) y los cuatro requisitos para enviarlo a revisión
-- —matrícula de comercio, representante legal con su poder, al menos una sucursal y el QR bancario—
-- quedaban vacíos: el comercio tenía que volver a entregar en su portal lo que el vendedor ya había
-- capturado, y hasta entonces el ERP no podía pedir la verificación al Motor.
--
-- Pablo (2026-10-02): «el usuario te lo pasa una vez y esto debe estar listo y cargado». Estas
-- columnas guardan esa captura en la cuenta; al abrir el caso de onboarding el ERP las entrega
-- completas a AtlasBackend (`MerchantFolderService`). La casa matriz ya existe (`address`, `city`)
-- y se convierte en la primera sucursal.
--
--   - Todas NULLABLE y aditivas: un prospecto (lead) no las tiene; se exigen al ABRIR el onboarding,
--     no al registrar la empresa. Sin backfill.
--   - Los archivos (poder notarial, imagen del QR) son filas de `atlas_accounting.erp_file`
--     (almacén de Atlas, prefijo `erp-B2B_ACCOUNT-<cuenta>/`); aquí va su id. Sin FK entre esquemas:
--     el archivo se borra en lógico (`status = DELETED`) y la cuenta debe seguir diciendo qué subió.
--   - La cuenta bancaria va ENMASCARADA: el expediente prueba de quién es, no la opera.
--
-- Idempotente.

ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS commercial_registry varchar(60),
  ADD COLUMN IF NOT EXISTS legal_rep_full_name varchar(200),
  ADD COLUMN IF NOT EXISTS legal_rep_document_type varchar(20),
  ADD COLUMN IF NOT EXISTS legal_rep_document_number varchar(60),
  ADD COLUMN IF NOT EXISTS power_of_attorney_file_id uuid,
  ADD COLUMN IF NOT EXISTS bank_qr_file_id uuid,
  ADD COLUMN IF NOT EXISTS bank_institution_code varchar(16),
  ADD COLUMN IF NOT EXISTS bank_account_masked varchar(40);

DO $$ BEGIN
  ALTER TABLE atlas_sales.b2b_accounts
    ADD CONSTRAINT ck_b2b_accounts_legal_rep_document_type
    CHECK (legal_rep_document_type IS NULL OR legal_rep_document_type IN ('ci', 'passport', 'foreign_id'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN atlas_sales.b2b_accounts.commercial_registry IS 'Matrícula de comercio (Fundempresa/SEPREC). Va al expediente del comercio en Atlas.';
COMMENT ON COLUMN atlas_sales.b2b_accounts.legal_rep_full_name IS 'Representante legal declarado en el alta; va al expediente del comercio en Atlas.';
COMMENT ON COLUMN atlas_sales.b2b_accounts.legal_rep_document_type IS 'ci | passport | foreign_id (mismo catálogo que el expediente de Atlas).';
COMMENT ON COLUMN atlas_sales.b2b_accounts.power_of_attorney_file_id IS 'erp_file del poder notarial que acredita al representante.';
COMMENT ON COLUMN atlas_sales.b2b_accounts.bank_qr_file_id IS 'erp_file con la imagen del QR bancario de cobro del comercio.';
COMMENT ON COLUMN atlas_sales.b2b_accounts.bank_institution_code IS 'Sigla ASFI de la entidad del QR bancario.';
COMMENT ON COLUMN atlas_sales.b2b_accounts.bank_account_masked IS 'Cuenta del QR bancario, enmascarada.';
