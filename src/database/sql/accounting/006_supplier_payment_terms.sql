-- Condiciones de pago a proveedor.
--
-- POR QUÉ ESTA TABLA. «Cómo se le paga a este proveedor» vivía como texto libre
-- en una nota del alta. Con eso no se puede calcular una fecha de vencimiento,
-- ni agrupar la cartera por modalidad para saber cuánto vence este mes, ni
-- validar nada: «30 días fdm», «a 30 dias fin de mes» y «neto 30» son la misma
-- condición escrita de tres formas y ningún informe las junta.
--
-- POR QUÉ ES HISTÓRICA Y NO UNA COLUMNA DEL PROVEEDOR. Una condición cambia
-- —se renegocia el plazo, se cambia de cuenta— y las facturas ya emitidas se
-- pactaron con la anterior. Guardarla como columna del proveedor reescribiría el
-- pasado: una factura de hace seis meses pasaría a vencer con el plazo de hoy y
-- la mora calculada dejaría de cuadrar con lo que se acordó. Por eso hay
-- vigencia y por eso `supplier_payment` puede citar la condición con la que se
-- emitió.

CREATE TABLE IF NOT EXISTS atlas_accounting.supplier_payment_terms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id     UUID NOT NULL,
  supplier_bp_id      UUID NOT NULL,

  -- Identidad legible. El código permite citarla en un contrato sin pegar un UUID.
  code                VARCHAR(40)  NOT NULL,
  name                VARCHAR(140) NOT NULL,
  description         TEXT,

  currency_code       CHAR(3)     NOT NULL,
  modality            VARCHAR(20) NOT NULL,
  computation_base    VARCHAR(20) NOT NULL DEFAULT 'FECHA_FACTURA',
  -- Días de plazo. Las modalidades con días fijos (contado, contra entrega) lo ignoran.
  term_days           INTEGER     NOT NULL DEFAULT 0,
  frequency           VARCHAR(20) NOT NULL DEFAULT 'UNICA',
  payment_method      VARCHAR(20) NOT NULL,
  -- Cuenta del proveedor. Obligatoria para transferencia y QR; lo valida el dominio.
  bp_bank_account_id  UUID,

  -- Tanto por ciento, no por uno: es como lo escribe quien negocia el contrato.
  advance_percentage  NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Retenciones e impuestos aplicables, por código de `tax_code`.
  withholding_codes   TEXT[]       NOT NULL DEFAULT '{}',
  -- Descuento por pronto pago, en tanto por ciento.
  early_payment_discount NUMERIC(5,2) NOT NULL DEFAULT 0,

  special_conditions  TEXT,
  notes               TEXT,

  status              VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
  valid_from          DATE        NOT NULL,
  -- `NULL` = vigente sin fecha de fin.
  valid_to            DATE,

  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_supplier_terms_code UNIQUE (legal_entity_id, supplier_bp_id, code),
  CONSTRAINT ck_supplier_terms_modality CHECK (
    modality IN ('CONTADO','CREDITO','ANTICIPO','CONTRA_ENTREGA','PARCIAL','HITOS','RECURRENTE')
  ),
  CONSTRAINT ck_supplier_terms_base CHECK (
    computation_base IN ('FECHA_FACTURA','FECHA_RECEPCION','FIN_DE_MES')
  ),
  CONSTRAINT ck_supplier_terms_frequency CHECK (
    frequency IN ('UNICA','SEMANAL','QUINCENAL','MENSUAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')
  ),
  CONSTRAINT ck_supplier_terms_method CHECK (
    payment_method IN ('TRANSFERENCIA','CHEQUE','EFECTIVO','TARJETA','QR','COMPENSACION')
  ),
  CONSTRAINT ck_supplier_terms_status CHECK (
    status IN ('BORRADOR','ACTIVA','SUSPENDIDA','VENCIDA','ARCHIVADA')
  ),
  CONSTRAINT ck_supplier_terms_days CHECK (term_days >= 0),
  CONSTRAINT ck_supplier_terms_advance CHECK (advance_percentage BETWEEN 0 AND 100),
  CONSTRAINT ck_supplier_terms_discount CHECK (early_payment_discount BETWEEN 0 AND 100),
  -- Una vigencia invertida no se detecta mirando: se rechaza al escribir.
  CONSTRAINT ck_supplier_terms_validity CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS ix_supplier_terms_supplier
  ON atlas_accounting.supplier_payment_terms (legal_entity_id, supplier_bp_id, status);

-- La consulta que hace el motor de pagos: la condición vigente HOY de un proveedor.
CREATE INDEX IF NOT EXISTS ix_supplier_terms_vigencia
  ON atlas_accounting.supplier_payment_terms (supplier_bp_id, valid_from, valid_to)
  WHERE status = 'ACTIVA';

-- Sólo UNA condición activa por proveedor y moneda a la vez. Sin esto, dos
-- condiciones solapadas hacen que la fecha de vencimiento dependa de cuál lea
-- primero la consulta — y esa fecha decide si hay mora.
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_terms_activa
  ON atlas_accounting.supplier_payment_terms (legal_entity_id, supplier_bp_id, currency_code)
  WHERE status = 'ACTIVA';

-- Con qué condición se emitió cada pago. Es lo que hace reproducible una fecha
-- de vencimiento seis meses después, cuando la condición ya se renegoció.
ALTER TABLE atlas_accounting.supplier_payment
  ADD COLUMN IF NOT EXISTS payment_terms_id UUID
  REFERENCES atlas_accounting.supplier_payment_terms(id);
