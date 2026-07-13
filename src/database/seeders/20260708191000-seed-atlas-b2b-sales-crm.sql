-- Seeds mínimos no sensibles para desarrollo local del módulo B2B Sales CRM.
-- No usar estos datos como usuarios reales de producción.

INSERT INTO atlas_sales.internal_users (id, full_name, email, role_code, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin ATLAS', 'admin.b2b@atlas.local', 'ADMIN', true),
  ('00000000-0000-0000-0000-000000000002', 'Ejecutivo Comercial ATLAS', 'ejecutivo.b2b@atlas.local', 'COMMERCIAL_EXECUTIVE', true),
  ('00000000-0000-0000-0000-000000000003', 'Finanzas ATLAS', 'finanzas.b2b@atlas.local', 'FINANCE', true),
  ('00000000-0000-0000-0000-000000000004', 'Operaciones ATLAS', 'operaciones.b2b@atlas.local', 'OPERATIONS', true),
  ('00000000-0000-0000-0000-000000000005', 'Legal ATLAS', 'legal.b2b@atlas.local', 'LEGAL', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO atlas_sales.territories (id, name, city, region, is_active)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Santa Cruz Centro', 'Santa Cruz de la Sierra', 'Santa Cruz', true),
  ('10000000-0000-0000-0000-000000000002', 'Santa Cruz Norte', 'Santa Cruz de la Sierra', 'Santa Cruz', true),
  ('10000000-0000-0000-0000-000000000003', 'La Paz Comercial', 'La Paz', 'La Paz', true)
ON CONFLICT (id) DO NOTHING;
