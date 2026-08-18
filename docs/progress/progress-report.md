# Informe de progreso del proyecto

## 1. Resumen del ciclo de trabajo

Se endureció el Portal del comercio (`/api/v1/portal/*`): el canal del usuario partner pasó de
confiar en los identificadores que enviaba el cliente a resolver el alcance contra
`atlas_sales.merchant_users`, con las invariantes sostenidas por el motor de base de datos,
auditoría de negocio en cada mutación y un smoke que demuestra el aislamiento entre comercios.
Detalle completo en `portal-scope-hardening-report.md`.

## 2. Avance realizado

- Se agregó `PortalScopeService`: autorización por tenant fail-closed, con acceso delegado auditado
  para el staff interno.
- Se agregó la migración `20260817120000-portal-merchant-scope-hardening.sql`: enlace de identidad
  en `merchant_users`, dueño B2B del anunciante publicitario, restricciones de estado y el índice
  único parcial que garantiza una sola suscripción activa por comercio.
- Se extrajeron a `ads/ads.campaign-transitions.ts` las invariantes de transición de campaña, que
  ahora comparten la consola administrativa y el portal.
- Se corrigieron dos defectos de cálculo: totales de facturación agregados en SQL con decimal exacto
  (`common/money`) y fin de período sin desbordar de mes (`common/time`).
- Se corrigió `run-sql.ts`: las reversas dejan de registrarse como aplicadas y la ejecución va en la
  misma transacción que el registro en el ledger de migraciones.
- Se agregaron fixtures de prueba, emisor de JWT de desarrollo y `npm run smoke:portal`.
- Se documentó el canal en `src/modules/portal/README.md`, `docs/endpoints/endpoints.md`, el
  contrato OpenAPI y la colección Postman (`06 - Portal del comercio`).

## 3. Riesgos detectados

| Riesgo                                                                  | Impacto                                                                 | Mitigación recomendada                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Las restricciones de la migración quedaron `NOT VALID`.                 | El histórico previo puede violarlas sin que el motor lo señale.         | Sanear y promover con `VALIDATE CONSTRAINT` en una ventana de mantenimiento.        |
| El enlace anunciante → cuenta B2B se hizo best-effort por NIT y país.   | Un anunciante sin correspondencia exacta y única no se ve en el portal. | Revisar `ad_advertiser_accounts WHERE merchant_account_id IS NULL`.                 |
| `merchant_users.user_id` no está backfilleado para usuarios históricos. | Dependen del enlace de respaldo por correo normalizado.                 | Backfill contra el directorio de AtlasBackend.                                      |
| El frontend del ERP aún no consume el portal endurecido.                | Los códigos de error del canal no tienen tratamiento en UI.             | Mapear `PORTAL_SCOPE_NOT_PROVISIONED` y los `403` de alcance en `AtlasERPFrontend`. |

## 4. Decisiones clave tomadas

| Decisión                                                             | Justificación                                                                                   | Impacto                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Resolver el alcance contra la base y no contra el JWT.               | El token dice quién es el llamador, no qué le pertenece; las membresías cambian sin reemitirlo. | Un rol correcto sin membresía activa no abre nada.                   |
| Dejar opcionales los identificadores de cuenta en los schemas.       | El comercio no los necesita y el staff interno sí; se validan siempre contra el alcance.        | No rompe clientes existentes y no debilita la autorización.          |
| Sostener "una sola suscripción activa" con un índice único parcial.  | El lock de aplicación no cubre scripts ni cargas manuales.                                      | La invariante deja de depender de que todos pasen por el servicio.   |
| Declarar las restricciones nuevas como `NOT VALID`.                  | Rigen para toda escritura nueva sin abortar la migración por filas heredadas.                   | Queda pendiente la validación del histórico, registrada como riesgo. |
| Compartir las transiciones de campaña con la consola administrativa. | Dos implementaciones de la misma regla divergen; la de moderación no puede divergir.            | El portal no puede activar una campaña sin aprobación.               |

## 5. Desviaciones de lo esperado

| Desviación                                                               | Motivo                                                                           | Acción recomendada                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| El smoke del portal exige fixtures y un JWT de usuario partner concreto. | El alcance se resuelve por membresía: un token genérico de ADMIN no prueba nada. | Ejecutar `db:seed:test-fixtures` y `dev:jwt` antes del smoke. |
| `AUTH_DISABLED_FOR_LOCAL_TESTING=true` no sirve para probar el portal.   | El usuario local no tiene membresías, así que todo responde 403.                 | Documentado en `docs/postman/README.md`.                      |

## 6. Fase actual del proyecto

Fase de endurecimiento del canal del comercio: autorización por tenant, invariantes en base de datos
y trazabilidad de las mutaciones del portal.

## 7. Próxima fase recomendada

Validar el histórico de las restricciones `NOT VALID`, hacer el backfill de `merchant_users.user_id`
y enlazar en el frontend del ERP los códigos de error del canal.

## 8. Estado general del entregable

Validado: type-check, lint, 17 suites de pruebas unitarias (121 tests), E2E y build aprobados; smoke
del portal ejecutado contra la API en modo autorizado con 13 casos aprobados, incluidos los cuatro
de acceso cruzado denegado.
