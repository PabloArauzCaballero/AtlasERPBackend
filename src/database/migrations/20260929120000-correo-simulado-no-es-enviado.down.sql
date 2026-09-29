-- Reversa de 20260929120000-correo-simulado-no-es-enviado.sql.
-- El CHECK anterior no admite SIMULATED, así que esas filas vuelven a SENT (el único valor que el
-- código anterior entiende) ANTES de restaurarlo. `sent_at` se queda NULL: no hay fecha verdadera.
UPDATE atlas_accounting.ad_email_messages SET status = 'SENT' WHERE status = 'SIMULATED';
UPDATE atlas_accounting.siat_email_delivery SET status = 'SENT' WHERE status = 'SIMULATED';

ALTER TABLE atlas_accounting.ad_email_messages
  DROP CONSTRAINT IF EXISTS ck_ad_email_message_status;
ALTER TABLE atlas_accounting.ad_email_messages
  ADD CONSTRAINT ck_ad_email_message_status
  CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED'));

ALTER TABLE atlas_accounting.siat_email_delivery
  DROP CONSTRAINT IF EXISTS ck_siat_email_delivery_status;
ALTER TABLE atlas_accounting.siat_email_delivery
  ADD CONSTRAINT ck_siat_email_delivery_status
  CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED'));
