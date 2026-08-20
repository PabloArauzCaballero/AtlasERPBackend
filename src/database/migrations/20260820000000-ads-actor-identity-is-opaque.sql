-- ATLAS Ads — el identificador del ACTOR también es opaco, no un UUID.
--
-- Continuación de `20260818040000-portal-identity-reference-is-opaque.sql`, que corrigió la misma
-- suposición en `merchant_users.user_id` y `ad_advertiser_users.user_id`. Quedaron ocho columnas
-- más con el defecto intacto: todas las que guardan QUIÉN hizo algo.
--
-- El `sub` del JWT de un usuario interno de ATLAS es la clave primaria `bigserial` de
-- `iam.internal_users`: llega como "1", "9", "27". Declarar la columna `uuid` hace que el INSERT
-- falle con `invalid input syntax for type uuid`.
--
-- Consecuencia medida (2026-08-19, navegador contra el entorno local): CUALQUIER acción
-- administrativa de Ads hecha por un usuario interno respondía 500 y **revertía la transacción
-- entera**. No es que se perdiera la auditoría: es que el alta no ocurría. Dar de alta un segmento
-- insertaba la fila, fallaba al escribir `ad_audit_log` y hacía rollback de las dos cosas.
--
-- Por qué no se había visto: la única población que sí escribía era la del portal del comercio,
-- cuyos ids SÍ son UUID de este backend. En `ad_audit_log` había exactamente una fila, y era suya
-- (`MERCHANT_PORTAL_USER`). El canal interno nunca había conseguido escribir ninguna, y como el
-- error salía como «error de base de datos» genérico, se leía como un problema de infraestructura.
--
-- Las columnas pasan a texto por el mismo criterio que la migración hermana: este backend no debe
-- presuponer el formato de los identificadores de otro servicio. `varchar(64)` cubre un bigint y un
-- UUID, así que los datos existentes siguen siendo válidos y no hay que migrarlos.
--
-- Ejecutar en PostgreSQL 14+. Idempotente.

ALTER TABLE ad_advertiser_accounts
  ALTER COLUMN created_by TYPE varchar(64) USING created_by::text;

ALTER TABLE ad_contracts
  ALTER COLUMN approved_by TYPE varchar(64) USING approved_by::text;

ALTER TABLE ad_campaigns
  ALTER COLUMN created_by TYPE varchar(64) USING created_by::text;

ALTER TABLE ad_creatives
  ALTER COLUMN created_by TYPE varchar(64) USING created_by::text;

ALTER TABLE ad_policy_rules
  ALTER COLUMN created_by TYPE varchar(64) USING created_by::text;

ALTER TABLE ad_moderation_reviews
  ALTER COLUMN reviewer_user_id TYPE varchar(64) USING reviewer_user_id::text;

ALTER TABLE ad_spend_ledger
  ALTER COLUMN created_by TYPE varchar(64) USING created_by::text;

ALTER TABLE ad_audit_log
  ALTER COLUMN actor_user_id TYPE varchar(64) USING actor_user_id::text;
