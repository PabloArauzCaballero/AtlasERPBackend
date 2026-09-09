-- =====================================================================================
-- El usuario de comercio guarda POR QUÉ Atlas rechazó su acceso.
-- =====================================================================================
-- El acuse (`POST cases/:id/identity/reconcile`) traía el motivo del rechazo en la respuesta y lo
-- tiraba: la fila quedaba DISABLED y, al volver a abrir la cola, sólo se leía «1 rechazada», sin
-- decir por qué. El ejecutivo tenía que volver a preguntar a Atlas para saber qué corregir. Se
-- persiste aquí para que la fila lo diga sola.

ALTER TABLE atlas_sales.merchant_users
  ADD COLUMN IF NOT EXISTS identity_rejection_reason varchar(240);

COMMENT ON COLUMN atlas_sales.merchant_users.identity_rejection_reason IS
  'Motivo con el que AtlasBackend rechazó la petición de identidad. Nulo si no se rechazó.';
