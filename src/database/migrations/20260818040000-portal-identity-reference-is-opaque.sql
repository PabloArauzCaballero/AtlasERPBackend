-- ATLAS Portal — el identificador del proveedor de identidad es OPACO, no un UUID.
--
-- Defecto corregido: `merchant_users.user_id` y `ad_advertiser_users.user_id` se declararon `uuid`
-- asumiendo que el `sub` del JWT lo era. No lo es. La identidad del comercio vive en AtlasBackend
-- (`iam.merchant_users`), cuya clave primaria es `bigserial`: el `sub` que llega es "1", "27", "348".
--
-- Consecuencia en producción: el enlace por identidad estable NUNCA aplicaba. `PortalScopeService`
-- sólo lo intentaba cuando el `sub` casaba con el patrón UUID, así que todo el alcance del portal
-- acababa resolviéndose por el correo — el enlace de respaldo, el que se rompe en cuanto alguien
-- cambia de dirección o el proveedor entrega el correo en otro formato. Es decir: el mecanismo
-- documentado como preferente estaba muerto y nadie lo notaba, porque el de respaldo respondía.
--
-- La columna pasa a texto: este backend no debe presuponer el formato de los identificadores de
-- otro servicio. `varchar(64)` cubre tanto un bigint como un UUID, así que los datos existentes
-- (las fixtures usan UUID) siguen siendo válidos y no hay que migrarlos.
--
-- Ejecutar en PostgreSQL 14+. Idempotente.

ALTER TABLE atlas_sales.merchant_users
  ALTER COLUMN user_id TYPE varchar(64) USING user_id::text;

ALTER TABLE ad_advertiser_users
  ALTER COLUMN user_id TYPE varchar(64) USING user_id::text;
