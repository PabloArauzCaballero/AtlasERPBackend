-- =====================================================================================
-- La banda de riesgo del cliente, conocida por decisión de Core (T-11)
-- =====================================================================================
-- Core (AtlasBackend + Motor) decide la banda de riesgo de un cliente al evaluar su crédito
-- (`credit.decision.recorded`). Hasta ahora el ERP no guardaba esa banda en ningún sitio: el
-- registro de una compra (`registerPurchase`) dejaba que el propio COMERCIO declarara
-- `riskTierAtOrigination` en el cuerpo de la petición, lo que le permitía elegir la tarifa MDR que
-- más le convenga. Esta tabla es la única fuente de la banda del lado del ERP; el comercio deja de
-- tener voto.
--
-- Clave: `customer_id` es el identificador de Core (numérico, en texto — igual convención que
-- `core_tenant_id`/`core_loan_id` en los enlaces de cuota de Core: TEXTO, no BIGINT, porque nunca se
-- opera aritméticamente sobre él y así no hay que ampliarlo si Core cambia de rango).
--
-- Idempotencia por evento: `last_event_key` guarda el `eventKey` del último evento aplicado. Un
-- reintento con el MISMO `eventKey` no vuelve a pisar la fila (se compara antes del UPDATE, ver
-- `CoreCreditEventsService`). Aparte, `decided_at` sólo avanza hacia ADELANTE: un evento tardío o
-- repetido con una decisión más VIEJA que la guardada no retrocede la banda vigente — un préstamo ya
-- aprobado con la banda B no puede volver a la A porque llegó fuera de orden un evento antiguo.
--
-- Sin fila para un cliente: sigue sin banda conocida, tal cual hoy. Eso es honesto, no un caso de
-- error.

CREATE TABLE IF NOT EXISTS atlas_sales.customer_risk_tiers (
  customer_id varchar(30) PRIMARY KEY,
  risk_tier varchar(20) NOT NULL,
  decided_at timestamptz NOT NULL,
  application_code varchar(80),
  last_event_key varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_customer_risk_tiers_customer_id_numeric CHECK (customer_id ~ '^[1-9][0-9]{0,18}$')
);

COMMENT ON TABLE atlas_sales.customer_risk_tiers IS
  'Última banda de riesgo conocida por cliente de Core (credit.decision.recorded). El ERP la lee al registrar una compra; el comercio no puede declarar la suya.';
COMMENT ON COLUMN atlas_sales.customer_risk_tiers.customer_id IS
  'customerId de Core, tal cual llega en el evento (identificador numérico en texto).';
COMMENT ON COLUMN atlas_sales.customer_risk_tiers.decided_at IS
  'decidedAt de la decisión de crédito de Core. Un UPSERT con un decided_at menor o igual al guardado no pisa la fila.';
COMMENT ON COLUMN atlas_sales.customer_risk_tiers.last_event_key IS
  'eventKey del último evento de Core aplicado. Repetir el mismo eventKey no vuelve a aplicar el efecto.';
