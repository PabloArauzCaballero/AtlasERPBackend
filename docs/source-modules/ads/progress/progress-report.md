# Informe de progreso del proyecto

## 1. Resumen del ciclo de trabajo

Se realizó una auditoría correctiva ultra estricta del módulo ATLAS Ads. La revisión comparó el entregable contra los lineamientos de `.index`, programación general, programación backend NestJS y los artefactos UML/contratos del módulo publicitario. No solo se documentaron hallazgos: se corrigieron fallas críticas de migración, facturación, idempotencia, seguridad JWT, tracking, presupuesto, ledger, validaciones, errores y documentación.

## 2. Avance realizado

- Releídos y aplicados los lineamientos de `prompt/index.md`, `prompt/programacionGeneral.md` y `prompt/programacionBackend.md`.
- Reanalizados los artefactos UML del módulo `atlas_ads_publicidad_externa_uml_v2`.
- Corregida la migración SQL principal para que pueda ejecutarse desde cero.
- Agregados índices únicos parciales para proteger idempotencia de eventos, ledger y facturación.
- Implementado endpoint faltante de perfil fiscal: `POST /api/v1/admin/ads/advertisers/:advertiserId/billing-profiles`.
- Reescrito cierre de facturación para agrupar correctamente por anunciante y moneda, con líneas por campaña.
- Endurecido registro de pagos para evitar moneda incorrecta, facturas cerradas y sobrepagos.
- Endurecido tracking de eventos con idempotencia por `deliveryDecisionId + eventType + requestId`.
- Implementada reserva de presupuesto atómica para evitar sobreconsumo concurrente.
- Corregido cambio de estado billable/no billable para crear créditos/ajustes y mantener ledger/presupuesto consistente.
- Agregado control de frequency cap en delivery por `corporateClientHash`.
- Endurecido JWT para exigir issuer, audience y `tokenType` permitido.
- Endurecido `CurrentUser` para responder 401 controlado en vez de lanzar error crudo.
- Endurecido request ID entrante para evitar valores inseguros en logs/respuestas.
- Ampliada redacción Pino de campos sensibles.
- Normalizados errores Sequelize en el filtro global.
- Ampliadas validaciones Zod de rangos de fechas.
- Actualizado smoke test para guardar resultado JSON en `scripts/smoke/admin-ads.smoke.result.json`.
- Actualizadas pruebas unitarias de schemas Zod.
- Actualizados `docs/endpoints/endpoints.md`, `docs/endpoints/openapi.yaml`, `docs/postman/collection.json`, `docs/architecture/architecture.md`, `docs/architecture/flows.md`.
- Creado `docs/audit/production-audit.md` con hallazgos, correcciones y riesgos residuales.
- Actualizadas dependencias NestJS a línea 11 compatible y reducido `npm audit` a observaciones moderadas, sin altas/críticas.

## 3. Riesgos detectados

| Riesgo                                                                   | Impacto                                                              | Mitigación recomendada                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| No se puede ejecutar PostgreSQL real dentro del sandbox                  | No se confirma smoke e2e real contra base de datos en esta auditoría | Ejecutar `yarn db:migrate`, `yarn db:seed` y `yarn smoke:admin` en staging                       |
| Vulnerabilidades moderadas transitivas restantes en árbol Sequelize/uuid | Riesgo moderado de supply chain                                      | Planificar hardening de dependencias o migración controlada cuando exista versión compatible     |
| Emisión fiscal/SIN no está definida                                      | Factura operativa no equivale a comprobante fiscal legal             | Integrar proveedor fiscal/contable antes de facturación real                                     |
| JWT depende de Auth ATLAS real                                           | Tokens emitidos con otro issuer/audience/tokenType serían rechazados | Alinear contrato de Auth con `JWT_INTERNAL_ISSUER`, `JWT_INTERNAL_AUDIENCE`, `tokenType` y roles |
| Alto volumen de eventos                                                  | `ad_events` puede crecer demasiado y degradar reportes               | Particionar por mes y crear jobs de archivo cuando el tráfico lo requiera                        |
| Reglas antifraude externas no definidas                                  | `fraudScore` depende del productor del evento                        | Integrar scoring antifraude o reglas internas antes de cobro comercial masivo                    |

## 4. Decisiones clave tomadas

| Decisión                                             | Justificación                                                        | Impacto                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Corregir en código y no solo reportar hallazgos      | El usuario pidió calidad de despliegue y auditoría estricta          | Entregable más cercano a producción real              |
| Mantener Sequelize y NestJS                          | Son reglas obligatorias del prompt backend                           | Evita desviaciones de arquitectura                    |
| Usar idempotencia por request/evento                 | Tracking publicitario puede recibir reintentos                       | Evita doble cobro y métricas infladas                 |
| Reservar presupuesto con SQL atómico                 | Sequelize puro no garantiza límite bajo alta concurrencia de eventos | Reduce riesgo de overspend                            |
| Facturar desde ledger agrupado por anunciante/moneda | Ledger es fuente contable correcta                                   | Evita facturas duplicadas o parciales por campaña     |
| Agregar endpoint de perfil fiscal                    | El cierre de facturación lo requiere                                 | Desbloquea flujo operativo completo                   |
| Exigir issuer/audience/tokenType en JWT              | Solo firma básica no basta para tokens internos                      | Menor riesgo de aceptar tokens de contexto incorrecto |

## 5. Desviaciones de lo esperado

| Desviación                                       | Motivo                                                              | Acción recomendada                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| No se ejecutó smoke con PostgreSQL real          | El entorno actual no tiene base PostgreSQL configurada              | Ejecutarlo en local/staging antes de producción                      |
| No se elimina completamente `npm audit` moderado | Queda en dependencias transitivas sin fix seguro automático         | Revisar en fase de dependencias; no forzar cambios mayores inseguros |
| No se integró emisión fiscal legal               | El prompt/modelo no define proveedor fiscal ni reglas SIN completas | Tratar facturas actuales como operativas, no fiscales                |

## 6. Fase actual del proyecto

Fase de auditoría correctiva y hardening backend completada para revisión técnica y staging.

## 7. Próxima fase recomendada

1. Ejecutar migraciones y seeders contra PostgreSQL real.
2. Ejecutar smoke e2e con token JWT real de ATLAS.
3. Validar Postman/OpenAPI contra staging.
4. Hacer hardening fiscal/contable si se cobrará dinero real.
5. Definir particionamiento de eventos antes de alto tráfico.

## 8. Estado general del entregable

El entregable está **corregido y apto para staging**. No debe declararse producción final hasta correr pruebas e2e reales con PostgreSQL y Auth ATLAS.

## 9. Validación técnica ejecutada

| Comando                   | Resultado               | Observación                                                                             |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `npm run type-check`      | Aprobado                | TypeScript sin errores.                                                                 |
| `npm run build`           | Aprobado                | NestJS compila correctamente.                                                           |
| `npm test -- --runInBand` | Aprobado                | Pruebas unitarias de schemas pasan.                                                     |
| `npm run lint`            | Aprobado                | ESLint no reporta errores.                                                              |
| `npm audit`               | Observaciones moderadas | Sin vulnerabilidades altas/críticas tras actualización; quedan 4 moderadas transitivas. |
