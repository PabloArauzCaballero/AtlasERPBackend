-- Reversa de 20260924100000-outbox-entrega-real.sql
--
-- NO borra columnas ni tablas. Las columnas de entrega (`status`, `attempts`, `published_at` por
-- ACK…) son la historia de qué se entregó y qué no, y la inbox es el registro que impide aplicar
-- dos veces un efecto: borrarla habilitaría duplicados económicos en el siguiente reenvío. El
-- código anterior sigue funcionando con ambas presentes (todas tienen default).
--
-- Sí retira el trigger de versión de agregado y los CHECK de estado, que son lo único que el
-- código anterior podría violar (su worker asignaba `published_at` sin tocar `status`).

DROP TRIGGER IF EXISTS trg_event_outbox_aggregate_version ON atlas_accounting.event_outbox;
DROP FUNCTION IF EXISTS atlas_accounting.event_outbox_assign_aggregate_version();

ALTER TABLE atlas_accounting.event_outbox
  DROP CONSTRAINT IF EXISTS chk_event_outbox_status,
  DROP CONSTRAINT IF EXISTS chk_event_outbox_published_consistent,
  DROP CONSTRAINT IF EXISTS chk_event_outbox_attempts,
  ALTER COLUMN aggregate_version DROP NOT NULL;
