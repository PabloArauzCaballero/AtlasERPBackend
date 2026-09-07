-- =====================================================================================
-- El usuario de comercio del CRM guarda QUÉ petición de identidad lo respalda.
-- =====================================================================================
-- Hasta aquí el ERP creaba su `atlas_sales.merchant_users` en estado ACTIVE y con `user_id`
-- nulo, y la identidad con la que esa persona inicia sesión la tecleaba por separado un operador
-- en el portal interno de Atlas. Nada ataba las dos cosas: si el correo no coincidía carácter a
-- carácter, el enlace preferente por `user_id` quedaba vacío para siempre y el alcance del portal
-- del comercio se resolvía por el enlace de respaldo. Un dedazo dejaba a la persona con sesión
-- válida y sin alcance, y el 403 aparecía mucho después, lejos de donde estaba la causa.
--
-- Ahora el ERP ENCOLA la petición en AtlasBackend (`iam.merchant_user_provisioning_requests`) y
-- guarda aquí su identificador. Con eso se puede responder, desde el ERP, «¿en qué quedó el acceso
-- que pedí?» sin salir a preguntar, y reconciliar el `user_id` cuando Atlas la concede.
--
-- `ACTIVE` deja de ser el estado de nacimiento: se nace `INVITED` —que ya existía en el CHECK— y se
-- pasa a `ACTIVE` cuando hay identidad detrás. Un usuario ACTIVE que no puede iniciar sesión es
-- exactamente el estado que hacía perder la tarde.

ALTER TABLE atlas_sales.merchant_users
  ADD COLUMN IF NOT EXISTS identity_request_id varchar(120);

COMMENT ON COLUMN atlas_sales.merchant_users.identity_request_id IS
  'Identificador de la petición de alta encolada en AtlasBackend (iam.merchant_user_provisioning_requests._id). Opaco: AtlasBackend emite bigints.';

-- Una petición respalda a UN usuario del CRM. Parcial porque la inmensa mayoría de las filas
-- históricas no tiene ninguna, y un único índice total las haría chocar entre sí por NULL en
-- algunos motores.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_users_identity_request
  ON atlas_sales.merchant_users(identity_request_id)
  WHERE identity_request_id IS NOT NULL;
