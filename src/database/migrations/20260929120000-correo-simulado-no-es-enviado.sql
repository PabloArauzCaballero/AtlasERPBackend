-- =====================================================================================
-- Un correo que no salió no está «enviado» — 2026-09-29
-- =====================================================================================
-- Con EMAIL_PROVIDER_MODE=mock (el valor por defecto) el ERP guardaba `status = 'SENT'` con un
-- `provider_message_id` inventado (`mock-…`) en las dos colas de correo: la de campañas de Ads
-- (`ad_email_messages`) y la de facturas al comprador (`siat_email_delivery`). Nadie había recibido
-- nada. Desde hoy esos correos quedan `SIMULATED`, sin `sent_at`.
--
-- Orden: primero se AMPLÍA el CHECK (si no, el UPDATE chocaría con él); después se reclasifican las
-- filas que el modo mock dejó como SENT. Se reconocen sin ambigüedad: sólo el modo mock escribe un
-- `provider_message_id` con prefijo `mock-` (SendGrid da el suyo). Idempotente.
ALTER TABLE atlas_accounting.ad_email_messages
  DROP CONSTRAINT IF EXISTS ck_ad_email_message_status;
ALTER TABLE atlas_accounting.ad_email_messages
  ADD CONSTRAINT ck_ad_email_message_status
  CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'SIMULATED', 'FAILED'));

ALTER TABLE atlas_accounting.siat_email_delivery
  DROP CONSTRAINT IF EXISTS ck_siat_email_delivery_status;
ALTER TABLE atlas_accounting.siat_email_delivery
  ADD CONSTRAINT ck_siat_email_delivery_status
  CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'SIMULATED', 'FAILED'));

UPDATE atlas_accounting.ad_email_messages
   SET status = 'SIMULATED', sent_at = NULL
 WHERE status = 'SENT'
   AND provider_message_id LIKE 'mock-%';

UPDATE atlas_accounting.siat_email_delivery
   SET status = 'SIMULATED', sent_at = NULL
 WHERE status = 'SENT'
   AND provider_message_id LIKE 'mock-%';

COMMENT ON CONSTRAINT ck_ad_email_message_status ON atlas_accounting.ad_email_messages IS
  'SENT = lo aceptó el proveedor real (SendGrid). SIMULATED = modo mock: no salió ningún correo.';
COMMENT ON CONSTRAINT ck_siat_email_delivery_status ON atlas_accounting.siat_email_delivery IS
  'SENT = lo aceptó el proveedor real (SendGrid). SIMULATED = buzón del emulador o modo mock: el comprador no lo recibió.';
