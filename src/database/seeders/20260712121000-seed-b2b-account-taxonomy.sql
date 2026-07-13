INSERT INTO atlas_sales.account_tags (name, description)
VALUES
  ('pyme', 'Pequeña o mediana empresa'),
  ('enterprise', 'Cuenta empresarial de gran escala'),
  ('mayorista', 'Operación comercial mayorista'),
  ('minorista', 'Operación comercial minorista'),
  ('omnicanal', 'Venta integrada en canales físicos y digitales'),
  ('ecommerce', 'Comercio electrónico'),
  ('alto-volumen', 'Cuenta de alto volumen transaccional')
ON CONFLICT DO NOTHING;
