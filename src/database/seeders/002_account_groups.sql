-- Grupos de reporte del plan de cuentas: la capa que convierte 1122 cuentas en un estado financiero.
--
-- `gl_account_group` existe desde `003_account_groups_and_entity_links.sql` y **no lo poblaba nadie**:
-- `account_group_id` estaba nulo en TODAS las cuentas. Consecuencia medible: el plan tenía toda la
-- estructura para contabilizar y ninguna para reportar — se podía registrar un asiento y no armar un
-- balance, porque nada decía a qué línea del estado sube cada cuenta.
--
-- ## Por qué grupos si el plan ya tiene jerarquía por `parent_account_id`
--
-- Son dos árboles con dos propósitos, y ésa es la razón de que la tabla exista aparte. La jerarquía
-- de cuentas es CONTABLE: agrupa por naturaleza (`12` cuentas por cobrar cuelga de `1` activo). El
-- grupo es de PRESENTACIÓN: dice en qué estado sale la cuenta y bajo qué epígrafe, y eso no siempre
-- coincide. El caso claro está aquí mismo: los ingresos financieros (`45`) son ingreso por
-- naturaleza y en el estado de resultados van **debajo** del resultado operativo, separados del
-- margen del negocio. Con un solo árbol habría que elegir cuál de las dos verdades se rompe.
--
-- ## Cómo se enlaza
--
-- Por PREFIJO de dos dígitos y no cuenta por cuenta: el plan oficial tiene 1122 cuentas y una lista
-- explícita quedaría obsoleta la primera vez que alguien añada una. El prefijo es la clave que el
-- propio plan usa para clasificar, así que una cuenta nueva hereda su grupo sin tocar este archivo.

SET search_path TO atlas_accounting;

WITH coa AS (
  SELECT id FROM chart_of_accounts WHERE code = 'ATLAS-BO-LOCAL' AND version_no = 1
)
INSERT INTO gl_account_group (coa_id, code, name, statement_type, classification, sub_classification, sort_order)
VALUES
  -- Balance: activo -------------------------------------------------------------------------
  ((SELECT id FROM coa), '11', 'Efectivo y equivalentes',                'BALANCE_SHEET', 'ASSET',     'CURRENT',      10),
  ((SELECT id FROM coa), '12', 'Cuentas por cobrar y activos financieros','BALANCE_SHEET', 'ASSET',     'CURRENT',      20),
  ((SELECT id FROM coa), '13', 'Activos fiscales y prepagos',            'BALANCE_SHEET', 'ASSET',     'CURRENT',      30),
  ((SELECT id FROM coa), '14', 'Activos financieros no corrientes',      'BALANCE_SHEET', 'ASSET',     'NON_CURRENT',  40),
  ((SELECT id FROM coa), '15', 'Propiedad, planta y equipo',             'BALANCE_SHEET', 'ASSET',     'NON_CURRENT',  50),
  ((SELECT id FROM coa), '16', 'Activos intangibles',                    'BALANCE_SHEET', 'ASSET',     'NON_CURRENT',  60),
  ((SELECT id FROM coa), '17', 'Activos por derecho de uso',             'BALANCE_SHEET', 'ASSET',     'NON_CURRENT',  70),
  ((SELECT id FROM coa), '18', 'Otros activos e impuesto diferido',      'BALANCE_SHEET', 'ASSET',     'NON_CURRENT',  80),
  -- Balance: pasivo -------------------------------------------------------------------------
  ((SELECT id FROM coa), '21', 'Pasivo operativo corriente',             'BALANCE_SHEET', 'LIABILITY', 'CURRENT',     110),
  ((SELECT id FROM coa), '22', 'Pasivo financiero corriente',            'BALANCE_SHEET', 'LIABILITY', 'CURRENT',     120),
  ((SELECT id FROM coa), '23', 'Provisiones corrientes',                 'BALANCE_SHEET', 'LIABILITY', 'CURRENT',     130),
  ((SELECT id FROM coa), '24', 'Pasivo financiero no corriente',         'BALANCE_SHEET', 'LIABILITY', 'NON_CURRENT', 140),
  ((SELECT id FROM coa), '25', 'Pasivo no corriente y diferido',         'BALANCE_SHEET', 'LIABILITY', 'NON_CURRENT', 150),
  ((SELECT id FROM coa), '26', 'Ingresos diferidos por contratos',       'BALANCE_SHEET', 'LIABILITY', 'NON_CURRENT', 160),
  -- Balance: patrimonio. Va también al estado de cambios en el patrimonio, que es su otro destino.
  ((SELECT id FROM coa), '31', 'Capital social',                         'BALANCE_SHEET', 'EQUITY',    'CAPITAL',     210),
  ((SELECT id FROM coa), '32', 'Aportes y primas',                       'BALANCE_SHEET', 'EQUITY',    'CAPITAL',     220),
  ((SELECT id FROM coa), '33', 'Reservas',                               'BALANCE_SHEET', 'EQUITY',    'RESERVES',    230),
  ((SELECT id FROM coa), '34', 'Resultados acumulados',                  'BALANCE_SHEET', 'EQUITY',    'RESULTS',     240),
  ((SELECT id FROM coa), '35', 'Resultado de la gestión',                'BALANCE_SHEET', 'EQUITY',    'RESULTS',     250),
  -- Los otros resultados integrales van al patrimonio y NO al resultado del ejercicio: son cambios
  -- de valor que todavía no se realizaron. Meterlos en resultados inflaría la utilidad con
  -- revaluaciones que nadie cobró.
  ((SELECT id FROM coa), '36', 'Otros resultados integrales',            'BALANCE_SHEET', 'EQUITY',    'OCI',         260),
  -- Resultados: ingresos --------------------------------------------------------------------
  ((SELECT id FROM coa), '41', 'Ingresos por MDR y comercios',           'INCOME_STATEMENT', 'REVENUE', 'OPERATING',  310),
  ((SELECT id FROM coa), '42', 'Ingresos por suscripciones y tecnología','INCOME_STATEMENT', 'REVENUE', 'OPERATING',  320),
  ((SELECT id FROM coa), '43', 'Ingresos por publicidad y datos',        'INCOME_STATEMENT', 'REVENUE', 'OPERATING',  330),
  ((SELECT id FROM coa), '44', 'Ingresos por recuperaciones',            'INCOME_STATEMENT', 'REVENUE', 'OPERATING',  340),
  -- Los financieros van APARTE del margen operativo: mezclarlos haría que un trimestre con
  -- diferencia de cambio favorable pareciera un trimestre con buen negocio.
  ((SELECT id FROM coa), '45', 'Ingresos financieros y cambiarios',      'INCOME_STATEMENT', 'REVENUE', 'FINANCIAL',  410),
  ((SELECT id FROM coa), '46', 'Otros ingresos operativos',              'INCOME_STATEMENT', 'REVENUE', 'OPERATING',  350),
  -- Resultados: costos y gastos --------------------------------------------------------------
  ((SELECT id FROM coa), '51', 'Costos directos de originación',         'INCOME_STATEMENT', 'EXPENSE', 'COST_OF_SERVICE', 510),
  -- La pérdida crediticia es su propio epígrafe y no un gasto operativo más: es el costo del
  -- riesgo, se mide contra la cartera y no contra los ingresos, y esconderlo entre los gastos de
  -- operación es la forma clásica de que una cartera deteriorándose no se vea.
  ((SELECT id FROM coa), '52', 'Pérdidas crediticias y fraude',          'INCOME_STATEMENT', 'EXPENSE', 'CREDIT_LOSS',     520),
  ((SELECT id FROM coa), '53', 'Costos de cobranza',                     'INCOME_STATEMENT', 'EXPENSE', 'COST_OF_SERVICE', 530),
  ((SELECT id FROM coa), '61', 'Tecnología, datos y seguridad',          'INCOME_STATEMENT', 'EXPENSE', 'OPERATING',       610),
  ((SELECT id FROM coa), '62', 'Personal y beneficios',                  'INCOME_STATEMENT', 'EXPENSE', 'OPERATING',       620),
  ((SELECT id FROM coa), '63', 'Ventas y marketing',                     'INCOME_STATEMENT', 'EXPENSE', 'OPERATING',       630),
  ((SELECT id FROM coa), '64', 'Operaciones y administración',           'INCOME_STATEMENT', 'EXPENSE', 'OPERATING',       640),
  ((SELECT id FROM coa), '65', 'Legal, cumplimiento y gobierno',         'INCOME_STATEMENT', 'EXPENSE', 'OPERATING',       650),
  -- Depreciación y amortización aparte del gasto operativo: es lo que separa el resultado
  -- operativo del EBITDA, y sin el epígrafe propio esa lectura hay que reconstruirla a mano.
  ((SELECT id FROM coa), '66', 'Depreciación, amortización y deterioro', 'INCOME_STATEMENT', 'EXPENSE', 'DEPRECIATION',    660),
  -- Debajo del resultado operativo, igual que sus ingresos hermanos del grupo 45.
  ((SELECT id FROM coa), '67', 'Gastos financieros y cambiarios',        'INCOME_STATEMENT', 'EXPENSE', 'FINANCIAL',       670),
  -- El impuesto va al final y solo: es lo que hay debajo de la última línea antes del neto, y
  -- sumarlo a los gastos de operación hace irreconocible el resultado antes de impuestos.
  ((SELECT id FROM coa), '68', 'Impuestos sobre resultados',             'INCOME_STATEMENT', 'EXPENSE', 'TAX',             680),
  ((SELECT id FROM coa), '69', 'Otros gastos no operativos',             'INCOME_STATEMENT', 'EXPENSE', 'NON_OPERATING',   690)
ON CONFLICT (coa_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      statement_type = EXCLUDED.statement_type,
      classification = EXCLUDED.classification,
      sub_classification = EXCLUDED.sub_classification,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

-- Enlace por prefijo de dos dígitos.
--
-- `account_group_id IS NULL` en el WHERE es deliberado: la siembra ASIGNA lo que falta y no pisa lo
-- que alguien haya reclasificado a mano. Una cuenta que contabilidad movió de epígrafe por una razón
-- que este archivo no conoce no debe volver a su sitio cada vez que se resiembra.
UPDATE gl_account a
   SET account_group_id = g.id
  FROM gl_account_group g
 WHERE g.coa_id = a.coa_id
   AND g.code = left(a.account_no, 2)
   AND a.account_group_id IS NULL
   AND length(a.account_no) > 2;
