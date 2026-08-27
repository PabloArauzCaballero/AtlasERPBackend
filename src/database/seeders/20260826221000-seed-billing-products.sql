-- Semilla minima del catalogo de productos facturables.
--
-- Son los tres conceptos por los que Atlas le pasa factura a un comercio hoy, y no hay un cuarto
-- escondido: alcance publicitario, clics publicitarios y la comision de la venta financiada. Vienen
-- creados de fabrica porque sin ellos la factura del partner vuelve a ser texto libre; lo que cada
-- comercio paga por unidad se configura aparte, en las tarifas del plan.
--
-- Idempotente por `code`. El UPDATE solo repone lo que describe al producto —nombre, unidad,
-- cuenta de ingreso—; el estado y el orden no se pisan para no revertir lo que haya decidido el
-- area comercial desde el ERP.

INSERT INTO atlas_sales.billing_products
  (code, name, description, charge_basis, source_type, unit_label, revenue_gl_account_code, currency, sort_order)
VALUES
  ('ADS_REACH_CPM', 'Alcance publicitario',
   'Personas alcanzadas por las campanas del comercio. Se cobra por cada 1.000 impresiones servidas, a la tarifa CPM del plan contratado.',
   'CPM', 'ADS_REACH', 'cada 1.000 personas alcanzadas', '43010101', 'BOB', 1),
  ('ADS_CLICK_CPC', 'Clics publicitarios',
   'Clics recibidos por los anuncios del comercio. Se cobra por clic valido, a la tarifa CPC del plan contratado.',
   'CPC', 'ADS_CLICKS', 'clic recibido', '43010102', 'BOB', 2),
  ('BNPL_MDR', 'Comision por venta financiada (MDR)',
   'Comision que retiene Atlas sobre cada venta financiada originada por el comercio. El porcentaje sale de la version contractual vigente, no del plan.',
   'MDR', 'MDR', 'venta financiada', '410101', 'BOB', 3)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  charge_basis = EXCLUDED.charge_basis,
  unit_label = EXCLUDED.unit_label,
  revenue_gl_account_code = EXCLUDED.revenue_gl_account_code,
  updated_at = now();

-- Lo ya facturado queda clasificado sin tocar importes: el enlace es el `source_type` que esos
-- cargos y esas lineas traian desde antes de que existiera el catalogo.
UPDATE atlas_sales.merchant_receivables AS r
SET product_id = p.id
FROM atlas_sales.billing_products AS p
WHERE r.product_id IS NULL AND p.source_type = r.source_type;

UPDATE atlas_sales.merchant_invoice_lines AS l
SET product_id = p.id
FROM atlas_sales.billing_products AS p
WHERE l.product_id IS NULL AND p.source_type = l.source_type;
