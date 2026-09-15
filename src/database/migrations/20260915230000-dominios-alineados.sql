-- =====================================================================================
-- Dominios cerrados alineados entre el esquema Zod y la base (2026-09-15)
-- =====================================================================================
--
-- Hasta hoy cada enum vivía en varias copias que nadie comparaba. Donde divergían, el formulario
-- enviaba un valor que el esquema aceptaba y la base rechazaba, y la respuesta era un 500
-- «error de base de datos» sin decir qué campo. Esta migración cierra las dos divergencias que la
-- prueba de contrato del catálogo encontró, y pone CHECK a dos columnas que eran texto libre.
--
-- Todo es AMPLIAR o AÑADIR: ningún valor que hoy exista en una fila deja de ser válido, así que no
-- hay ningún UPDATE ni se reescribe historial. Idempotente: se puede aplicar dos veces.

-- 1. `gl_account.status`: el esquema admite ARCHIVED desde el principio (archivar una cuenta del
--    plan) y el CHECK sólo ACTIVE/INACTIVE.
ALTER TABLE atlas_accounting.gl_account
  DROP CONSTRAINT IF EXISTS chk_gl_account_status,
  ADD CONSTRAINT chk_gl_account_status
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));

-- 2. `business_partner.status`: la base admitía BLOCKED y el esquema no; el esquema admitía
--    ARCHIVED y la base no. El dominio es la unión.
ALTER TABLE atlas_accounting.business_partner
  DROP CONSTRAINT IF EXISTS chk_bp_status,
  ADD CONSTRAINT chk_bp_status
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED'));

-- 3. Ciclo de facturación y política de liquidación de un contrato comercial. Eran varchar sin
--    restricción; en dev sólo existen los valores por defecto (MONTHLY, PER_CONTRACT). NOT VALID:
--    protege lo que se escriba desde ahora sin escanear ni juzgar lo que ya está.
ALTER TABLE atlas_sales.b2b_contracts
  DROP CONSTRAINT IF EXISTS ck_b2b_contracts_billing_cycle,
  ADD CONSTRAINT ck_b2b_contracts_billing_cycle
  CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL')) NOT VALID;

ALTER TABLE atlas_sales.b2b_contracts
  DROP CONSTRAINT IF EXISTS ck_b2b_contracts_settlement_policy,
  ADD CONSTRAINT ck_b2b_contracts_settlement_policy
  CHECK (settlement_policy IN ('PER_CONTRACT', 'PER_BRANCH', 'PER_ACCOUNT')) NOT VALID;
