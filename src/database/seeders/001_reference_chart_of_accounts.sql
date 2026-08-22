-- Plan de cuentas MÍNIMO. **No es el que se siembra por defecto** — ver `db:seed:accounting`.
--
-- Son 42 cuentas sin jerarquía, pensadas para arrancar el módulo contable en una prueba local sin
-- cargar el plan completo. El plan real de ATLAS Bolivia son 1122 cuentas con su árbol, sus
-- mayores, sus períodos y sus reglas de contabilización, y vive en
-- `official/atlas_official_bootstrap_seeds.json`.
--
-- Durante un tiempo ESTE archivo era lo que corría `yarn db:seed`, y el efecto medido era que una
-- instalación nueva quedaba con 42 cuentas, **cero mayores y cero períodos**: el módulo contable no
-- podía registrar un solo asiento, y el plan completo sólo entraba si alguien recordaba
-- `db:seed:official`. Se conserva como `db:seed:accounting:minimal` porque sigue siendo útil para
-- una prueba acotada, pero ya no es el camino por defecto.

SET search_path TO atlas_accounting;

INSERT INTO chart_of_accounts (code, name, version_no, effective_from, status)
VALUES ('ATLAS-BO-LOCAL', 'Plan de cuentas ATLAS Bolivia local', 1, CURRENT_DATE, 'ACTIVE')
ON CONFLICT (code, version_no) DO NOTHING;

WITH coa AS (
  SELECT id FROM chart_of_accounts WHERE code = 'ATLAS-BO-LOCAL' AND version_no = 1
)
INSERT INTO gl_account (
  coa_id, account_no, name, account_type, normal_balance, is_control_account,
  requires_cost_center, requires_profit_center, requires_partner, requires_tax_code, status
)
VALUES
((SELECT id FROM coa), '110101', 'Caja operativa', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '110201', 'Banco BOB operativo', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '110202', 'Banco USD operativo', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '110301', 'Inversiones temporales', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '120101', 'CxC clientes corporativos', 'ASSET', 'D', true, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '120102', 'CxC comercios por MDR', 'ASSET', 'D', true, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '120103', 'CxC intercompany', 'ASSET', 'D', true, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '120201', 'Anticipos a proveedores', 'ASSET', 'D', false, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '130101', 'Crédito fiscal IVA', 'ASSET', 'D', true, false, false, false, true, 'ACTIVE'),
((SELECT id FROM coa), '140101', 'Software capitalizado', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '140102', 'Licencias capitalizadas', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '150101', 'Equipos de cómputo', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '150201', 'Depreciación acumulada PPE', 'CONTRA_ASSET', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '160101', 'Depósitos y garantías entregadas', 'ASSET', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '210101', 'CxP proveedores', 'LIABILITY', 'C', true, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '210201', 'Sueldos y cargas por pagar', 'LIABILITY', 'C', false, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '220101', 'IVA débito fiscal', 'LIABILITY', 'C', true, false, false, false, true, 'ACTIVE'),
((SELECT id FROM coa), '220102', 'IT por pagar', 'LIABILITY', 'C', true, false, false, false, true, 'ACTIVE'),
((SELECT id FROM coa), '220103', 'IUE por pagar corriente', 'LIABILITY', 'C', true, false, false, false, true, 'ACTIVE'),
((SELECT id FROM coa), '230101', 'Préstamos bancarios CP', 'LIABILITY', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '230201', 'Intereses por pagar', 'LIABILITY', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '240101', 'Préstamos bancarios LP', 'LIABILITY', 'C', false, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '240201', 'Línea de crédito revolving', 'LIABILITY', 'C', false, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '250101', 'Provisión cobertura a comercios', 'LIABILITY', 'C', false, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '250102', 'Provisión juicios/contingencias', 'LIABILITY', 'C', false, false, false, true, false, 'ACTIVE'),
((SELECT id FROM coa), '260101', 'Ingresos diferidos SaaS', 'LIABILITY', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '310101', 'Capital social', 'EQUITY', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '310201', 'Aportes por capitalizar', 'EQUITY', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '320101', 'Resultados acumulados', 'EQUITY', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '410101', 'Ingresos MDR', 'REVENUE', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '410201', 'Ingresos SaaS plataforma', 'REVENUE', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '410202', 'Ingresos implementación', 'REVENUE', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '410301', 'Ingresos intercompany', 'REVENUE', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '420101', 'Ingresos financieros', 'REVENUE', 'C', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '510101', 'Gasto cloud e infraestructura', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '510201', 'Gasto de personal', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '510301', 'Gasto marketing', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '520101', 'Gasto por intereses', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '520201', 'Gasto por deterioro / ECL', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '520301', 'Gasto por provisión garantías', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '530101', 'Depreciación PPE', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE'),
((SELECT id FROM coa), '530201', 'Amortización intangibles', 'EXPENSE', 'D', false, false, false, false, false, 'ACTIVE')
ON CONFLICT (coa_id, account_no) DO NOTHING;

INSERT INTO tax_code (code, tax_type, rate, recoverable_percent, effective_from, status)
VALUES
  ('IVA13_VENTA', 'IVA', 13.0000, 0.0000, CURRENT_DATE, 'ACTIVE'),
  ('IVA13_COMPRA', 'IVA', 13.0000, 100.0000, CURRENT_DATE, 'ACTIVE'),
  ('IT3', 'IT', 3.0000, 0.0000, CURRENT_DATE, 'ACTIVE'),
  ('IUE25', 'IUE', 25.0000, 0.0000, CURRENT_DATE, 'ACTIVE')
ON CONFLICT (code) DO NOTHING;
