-- =====================================================================================
-- Facturación electrónica con el SIAT (SIN Bolivia): núcleo fiscal (2026-09-26)
-- =====================================================================================
-- Plan: `_plan-facturacion-siat-2026-09-26/PLAN.md` §2.2. Hasta hoy `electronic_tax_document` sólo
-- guardaba lo que el cliente AFIRMABA (FND-ERPB-09): el ERP no hablaba con el SIN. Esta migración
-- crea lo que la integración necesita —perfil del emisor, CUIS/CUFD, serie fiscal, eventos de
-- contingencia, paquetes, catálogos sincronizados, bitácora de transacciones— y amplía el documento
-- fiscal para que sirva a las tres fuentes (factura AR, factura de comercio, factura de publicidad).
--
-- Todo es AÑADIR o AMPLIAR. El CHECK de estados es un superconjunto de lo que el esquema admitía
-- (PENDING, SENT, ACCEPTED, OBSERVED, REJECTED, VOIDED). Las filas existentes reciben su fuente
-- (`AR_INVOICE`, su factura) con un UPDATE re-ejecutable. Idempotente: CI la aplica dos veces.

-- 1. Perfil del emisor: quién factura, desde qué sucursal y punto de venta del SIN, y en qué
--    modalidad. La zona horaria NO está aquí: se lee de `legal_entity.timezone`.
CREATE TABLE IF NOT EXISTS atlas_accounting.siat_issuer_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES atlas_accounting.legal_entity(id),
  branch_id uuid REFERENCES atlas_accounting.branch(id),
  nit varchar(13) NOT NULL,
  razon_social varchar(200) NOT NULL,
  municipio varchar(25) NOT NULL,
  direccion varchar(500) NOT NULL,
  telefono varchar(25),
  codigo_sucursal integer NOT NULL DEFAULT 0,
  codigo_punto_venta integer NOT NULL DEFAULT 0,
  codigo_modalidad smallint NOT NULL DEFAULT 2,
  codigo_documento_sector smallint NOT NULL DEFAULT 1,
  actividad_economica varchar(10) NOT NULL,
  leyenda_default varchar(200),
  usuario_emisor varchar(100) NOT NULL DEFAULT 'atlas-erp',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_siat_issuer_profile_point UNIQUE (legal_entity_id, codigo_sucursal, codigo_punto_venta),
  CONSTRAINT ck_siat_issuer_profile_nit CHECK (nit ~ '^[0-9]{1,13}$'),
  CONSTRAINT ck_siat_issuer_profile_modalidad CHECK (codigo_modalidad BETWEEN 1 AND 2),
  CONSTRAINT ck_siat_issuer_profile_sucursal CHECK (codigo_sucursal BETWEEN 0 AND 9999),
  CONSTRAINT ck_siat_issuer_profile_pos CHECK (codigo_punto_venta BETWEEN 0 AND 9999),
  CONSTRAINT ck_siat_issuer_profile_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 2. Credenciales del SIN: historial, no sólo la vigente. `raw_response` guarda lo que respondió.
CREATE TABLE IF NOT EXISTS atlas_accounting.siat_cuis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_profile_id uuid NOT NULL REFERENCES atlas_accounting.siat_issuer_profile(id),
  codigo varchar(100) NOT NULL,
  fecha_vigencia timestamptz NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  raw_response jsonb,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ix_siat_cuis_profile_active
  ON atlas_accounting.siat_cuis (issuer_profile_id, is_active, fecha_vigencia DESC);

CREATE TABLE IF NOT EXISTS atlas_accounting.siat_cufd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_profile_id uuid NOT NULL REFERENCES atlas_accounting.siat_issuer_profile(id),
  cuis_id uuid REFERENCES atlas_accounting.siat_cuis(id),
  codigo varchar(120) NOT NULL,
  codigo_control varchar(40) NOT NULL,
  direccion varchar(500),
  fecha_vigencia timestamptz NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  raw_response jsonb,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ix_siat_cufd_profile_active
  ON atlas_accounting.siat_cufd (issuer_profile_id, is_active, fecha_vigencia DESC);

-- 3. Serie fiscal: `numeroFactura` es numérico y correlativo por sucursal/POS, y entra en el CUF.
--    Se reserva con `UPDATE … RETURNING` dentro de la transacción de la factura.
CREATE TABLE IF NOT EXISTS atlas_accounting.siat_number_series (
  issuer_profile_id uuid PRIMARY KEY REFERENCES atlas_accounting.siat_issuer_profile(id),
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_siat_number_series_range CHECK (last_number BETWEEN 0 AND 9999999999)
);

-- 4. Contingencia: eventos significativos y paquetes.
CREATE TABLE IF NOT EXISTS atlas_accounting.siat_significant_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_profile_id uuid NOT NULL REFERENCES atlas_accounting.siat_issuer_profile(id),
  codigo_evento integer NOT NULL,
  descripcion varchar(500) NOT NULL,
  inicio timestamptz NOT NULL,
  fin timestamptz,
  cufd_evento_id uuid NOT NULL REFERENCES atlas_accounting.siat_cufd(id),
  cufd_envio_id uuid REFERENCES atlas_accounting.siat_cufd(id),
  codigo_recepcion_evento bigint,
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_siat_significant_event_status CHECK (status IN ('OPEN', 'CLOSED', 'REGISTERED', 'DISPATCHED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_siat_significant_event_open
  ON atlas_accounting.siat_significant_event (issuer_profile_id) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS atlas_accounting.siat_package (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES atlas_accounting.siat_significant_event(id),
  cantidad_facturas integer NOT NULL,
  hash_archivo varchar(64) NOT NULL,
  bytes integer NOT NULL,
  codigo_recepcion varchar(100),
  codigo_estado integer,
  mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_siat_package_cantidad CHECK (cantidad_facturas BETWEEN 1 AND 500)
);

-- 5. Catálogos del SIN sincronizados (paramétricas, actividades, productos, leyendas…).
CREATE TABLE IF NOT EXISTS atlas_accounting.siat_catalog_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_code varchar(40) NOT NULL,
  codigo varchar(40) NOT NULL,
  descripcion text NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  simulated boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_siat_catalog_item UNIQUE (catalog_code, codigo)
);

CREATE TABLE IF NOT EXISTS atlas_accounting.siat_catalog_sync_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_profile_id uuid NOT NULL REFERENCES atlas_accounting.siat_issuer_profile(id),
  mode varchar(20) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  catalogs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok boolean,
  error text
);

-- 6. Bitácora de cada llamada al SIN (o al emulador). Nunca guarda cabeceras: ahí va el token.
CREATE TABLE IF NOT EXISTS atlas_accounting.siat_transaction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_profile_id uuid REFERENCES atlas_accounting.siat_issuer_profile(id),
  operacion varchar(60) NOT NULL,
  mode varchar(20) NOT NULL,
  request_redacted jsonb,
  response jsonb,
  codigo_estado integer,
  http_status integer,
  latency_ms integer NOT NULL,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_siat_transaction_log_created
  ON atlas_accounting.siat_transaction_log (created_at DESC);

-- 7. El documento fiscal, v2: sirve a las tres fuentes y guarda lo que el SIN respondió.
ALTER TABLE atlas_accounting.electronic_tax_document
  ALTER COLUMN ar_invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_type varchar(30),
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES atlas_accounting.electronic_tax_document(id),
  ADD COLUMN IF NOT EXISTS issuer_profile_id uuid REFERENCES atlas_accounting.siat_issuer_profile(id),
  ADD COLUMN IF NOT EXISTS numero_factura bigint,
  ADD COLUMN IF NOT EXISTS cuis varchar(100),
  ADD COLUMN IF NOT EXISTS cufd_id uuid REFERENCES atlas_accounting.siat_cufd(id),
  ADD COLUMN IF NOT EXISTS codigo_documento_sector smallint,
  ADD COLUMN IF NOT EXISTS tipo_factura_documento smallint,
  ADD COLUMN IF NOT EXISTS codigo_emision smallint,
  ADD COLUMN IF NOT EXISTS codigo_modalidad smallint,
  ADD COLUMN IF NOT EXISTS codigo_excepcion smallint,
  ADD COLUMN IF NOT EXISTS fecha_emision varchar(23),
  ADD COLUMN IF NOT EXISTS codigo_recepcion varchar(100),
  ADD COLUMN IF NOT EXISTS codigo_estado_sin integer,
  ADD COLUMN IF NOT EXISTS mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS xml_gzip bytea,
  ADD COLUMN IF NOT EXISTS xml_sha256 varchar(64),
  ADD COLUMN IF NOT EXISTS receptor_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS monto_total numeric(18,2),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES atlas_accounting.siat_significant_event(id),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES atlas_accounting.siat_package(id),
  ADD COLUMN IF NOT EXISTS annulment_motivo smallint,
  ADD COLUMN IF NOT EXISTS annulled_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Las filas que ya existen salen de una factura AR: se les pone su fuente (re-ejecutable).
UPDATE atlas_accounting.electronic_tax_document
   SET source_type = 'AR_INVOICE', source_id = ar_invoice_id
 WHERE source_type IS NULL AND ar_invoice_id IS NOT NULL;

ALTER TABLE atlas_accounting.electronic_tax_document
  DROP CONSTRAINT IF EXISTS chk_einvoice_siat_status,
  ADD CONSTRAINT chk_einvoice_siat_status
  CHECK (siat_status IN ('PENDING', 'QUEUED', 'SENT', 'ACCEPTED', 'OBSERVED', 'REJECTED', 'OFFLINE', 'PACKAGED', 'ERROR', 'VOIDED'));

ALTER TABLE atlas_accounting.electronic_tax_document
  DROP CONSTRAINT IF EXISTS chk_einvoice_source_type,
  ADD CONSTRAINT chk_einvoice_source_type
  CHECK (source_type IN ('AR_INVOICE', 'MERCHANT_INVOICE', 'AD_INVOICE'));

-- Una factura tenía UN documento fiscal para siempre (`uq_einvoice_ar_invoice`). Ahora un
-- documento RECHAZADO o ANULADO puede ser reemplazado por otro: la unicidad es de los vivos.
DROP INDEX IF EXISTS atlas_accounting.uq_einvoice_ar_invoice;
CREATE UNIQUE INDEX IF NOT EXISTS uq_einvoice_live_source
  ON atlas_accounting.electronic_tax_document (source_type, source_id)
  WHERE siat_status NOT IN ('REJECTED', 'VOIDED');
CREATE INDEX IF NOT EXISTS ix_einvoice_processor
  ON atlas_accounting.electronic_tax_document (siat_status, next_attempt_at)
  WHERE siat_status IN ('QUEUED', 'ERROR', 'SENT');

-- 8. Receptor: los datos fiscales del socio de negocio (tipo de documento SIN, complemento y
--    correo al que se envía la factura).
ALTER TABLE atlas_accounting.business_partner
  ADD COLUMN IF NOT EXISTS tax_document_type smallint,
  ADD COLUMN IF NOT EXISTS tax_id_complement varchar(5),
  ADD COLUMN IF NOT EXISTS billing_email varchar(180);

COMMENT ON TABLE atlas_accounting.siat_issuer_profile IS
  'Emisor ante el SIN: NIT, sucursal y punto de venta del SIN, modalidad y actividad. Uno por entidad legal y punto.';
COMMENT ON TABLE atlas_accounting.siat_transaction_log IS
  'Cada llamada al SIN o a su emulador: operación, latencia, código y respuesta. Nunca cabeceras (el token viaja ahí).';
COMMENT ON COLUMN atlas_accounting.electronic_tax_document.fecha_emision IS
  'fechaEmision exacta del XML (hora local del emisor, sin zona): entra en el CUF y no se recalcula.';
