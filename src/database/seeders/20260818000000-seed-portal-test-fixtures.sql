-- Fixtures de PRUEBA del portal del comercio. Solo para entornos locales y de QA.
--
-- Existen porque los smokes del portal no pueden verificar lo que el portal existe para impedir
-- —que un comercio vea o toque lo de otro— sin al menos DOS comercios reales en la base, cada uno
-- con su usuario, su anunciante y sus campañas. Con un solo tenant, un endpoint roto y uno
-- endurecido responden exactamente igual.
--
-- Los identificadores son fijos y legibles a propósito: los smokes y la documentación de usuarios
-- de prueba los citan textualmente. Ningún dato aquí es real ni sensible.
--
-- Idempotente. NO ejecutar en producción: `atlas_sales.b2b_accounts` con estos IDs son datos de
-- prueba y `lifecycle_status = CUSTOMER` los hace contratables.

-- =====================================================================================
-- Comercios: Alfa (el del token) y Beta (el ajeno, para probar el 403 entre tenants)
-- =====================================================================================
INSERT INTO atlas_sales.b2b_accounts
  (id, legal_name, trade_name, tax_id, account_type, industry, lifecycle_status,
   category, business_line, country_code, city)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Comercio Alfa SRL', 'Alfa Store', 'TEST-ALFA-001',
   'MERCHANT', 'RETAIL', 'CUSTOMER', 'RETAIL', 'Tienda de electrodomésticos', 'BO', 'Santa Cruz de la Sierra'),
  ('a1000000-0000-4000-8000-000000000002', 'Comercio Beta SRL', 'Beta Market', 'TEST-BETA-002',
   'MERCHANT', 'RETAIL', 'CUSTOMER', 'RETAIL', 'Supermercado de barrio', 'BO', 'La Paz')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================================
-- Usuarios de comercio. `user_id` es el `sub` del JWT de prueba: es lo que enlaza la identidad
-- del token con el tenant, y sin él `PortalScopeService` deniega (fail-closed).
-- =====================================================================================
INSERT INTO atlas_sales.merchant_users
  (id, account_id, email, full_name, role_code, status, user_id)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'merchant.alfa@atlas.test', 'Ana Alfa', 'MERCHANT_ADMIN', 'ACTIVE',
   'c1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002',
   'merchant.beta@atlas.test', 'Bruno Beta', 'MERCHANT_ADMIN', 'ACTIVE',
   'c1000000-0000-4000-8000-000000000002'),
  -- Membresía revocada: su JWT es válido y trae MERCHANT_ADMIN, pero no debe acceder a nada.
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
   'merchant.revocado@atlas.test', 'Carla Revocada', 'MERCHANT_ADMIN', 'SUSPENDED',
   'c1000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO atlas_sales.merchant_branches (id, account_id, name, city, address, status, can_originate_bnpl, activated_at)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Alfa Centro', 'Santa Cruz de la Sierra', 'Av. Monseñor Rivero 100', 'ACTIVE', true, now()),
  ('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'Alfa Norte', 'Santa Cruz de la Sierra', 'Av. Banzer 2000', 'ACTIVE', true, now()),
  ('d1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
   'Beta Sopocachi', 'La Paz', 'Av. 20 de Octubre 500', 'ACTIVE', true, now())
ON CONFLICT (id) DO NOTHING;

-- =====================================================================================
-- Facturación del comercio Alfa: dos facturas y dos cobros, para que el panel tenga totales
-- distintos de cero y se pueda contrastar contra la suma exacta.
-- =====================================================================================
INSERT INTO atlas_sales.merchant_invoices
  (id, account_id, invoice_number, invoice_date, due_date, subtotal_amount, tax_amount, total_amount, status)
VALUES
  ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'FAC-TEST-0001', current_date - 30, current_date - 15, 1000.00, 130.00, 1130.00, 'ISSUED'),
  ('e1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'FAC-TEST-0002', current_date - 5, current_date + 10, 2000.00, 260.00, 2260.00, 'ISSUED'),
  ('e1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
   'FAC-TEST-BETA-1', current_date - 3, current_date + 12, 500.00, 65.00, 565.00, 'ISSUED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO atlas_sales.merchant_receivables
  (id, account_id, invoice_id, source_type, amount_original, amount_open, currency, issued_at, due_date, status)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000001', 'INVOICE', 1130.00, 1130.00, 'BOB', now() - interval '30 days',
   current_date - 15, 'OVERDUE'),
  ('f1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000002', 'INVOICE', 2260.00, 1000.00, 'BOB', now() - interval '5 days',
   current_date + 10, 'PARTIALLY_PAID')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================================
-- Publicidad: un anunciante por comercio, enlazado por `merchant_account_id`. Sin ese enlace el
-- anunciante es invisible desde el portal, que es justamente el comportamiento fail-closed.
-- =====================================================================================
INSERT INTO ad_advertiser_accounts
  (id, legal_name, trade_name, tax_id, country_code, city, business_category,
   primary_contact_name, primary_contact_email, status, billing_mode, currency,
   credit_limit_micros, risk_status, merchant_account_id)
VALUES
  ('11000000-0000-4000-8000-000000000001', 'Comercio Alfa SRL', 'Alfa Store', 'TEST-ALFA-001', 'BO',
   'Santa Cruz de la Sierra', 'RETAIL', 'Ana Alfa', 'ads.alfa@atlas.test', 'ACTIVE', 'POSTPAID', 'BOB',
   500000000, 'NORMAL', 'a1000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000002', 'Comercio Beta SRL', 'Beta Market', 'TEST-BETA-002', 'BO',
   'La Paz', 'RETAIL', 'Bruno Beta', 'ads.beta@atlas.test', 'ACTIVE', 'POSTPAID', 'BOB',
   500000000, 'NORMAL', 'a1000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ad_advertiser_users (id, advertiser_id, user_id, email, role, status)
VALUES
  ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'merchant.alfa@atlas.test', 'OWNER', 'ACTIVE'),
  ('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000002', 'merchant.beta@atlas.test', 'OWNER', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Cada campaña cubre una rama distinta del toggle del portal.
INSERT INTO ad_campaigns
  (id, advertiser_id, name, objective, status, approval_status, currency,
   budget_total_micros, budget_daily_micros, spend_total_micros, starts_at, ends_at)
VALUES
  -- Alfa · activa y aprobada: se puede pausar y volver a activar.
  ('13000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   'Alfa · Temporada alta', 'TRAFFIC', 'ACTIVE', 'APPROVED', 'BOB',
   1000000000, 50000000, 120000000, now() - interval '7 days', now() + interval '30 days'),
  -- Alfa · rechazada por moderación: activarla debe fallar con CAMPAIGN_NOT_APPROVED.
  ('13000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001',
   'Alfa · Creativo rechazado', 'AWARENESS', 'PAUSED', 'REJECTED', 'BOB',
   500000000, 20000000, 0, now() - interval '3 days', now() + interval '30 days'),
  -- Alfa · presupuesto agotado: activarla debe fallar con CAMPAIGN_BUDGET_EXHAUSTED.
  ('13000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001',
   'Alfa · Presupuesto agotado', 'CONVERSIONS', 'PAUSED', 'APPROVED', 'BOB',
   300000000, 10000000, 300000000, now() - interval '20 days', now() + interval '10 days'),
  -- Beta · ajena: cualquier operación desde el token de Alfa debe responder 403.
  ('13000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000002',
   'Beta · Lanzamiento', 'TRAFFIC', 'ACTIVE', 'APPROVED', 'BOB',
   800000000, 40000000, 50000000, now() - interval '2 days', now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;
