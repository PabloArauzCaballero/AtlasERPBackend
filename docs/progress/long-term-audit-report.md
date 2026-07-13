# Auditoría ultra estricta de riesgos a largo plazo

## Resultado ejecutivo

La segunda auditoría no se limitó a verificar que el proyecto compilara. Se revisó contra los prompts base, los diagramas del módulo y criterios de operación real: mantenibilidad, idempotencia, concurrencia, reglas financieras, integridad de datos y despliegue Docker.

El resultado previo ya pasaba build/lint/tests, pero aún tenía puntos que podían complicar el mantenimiento a mediano plazo. En este ciclo se corrigieron los riesgos corregibles dentro del alcance del ZIP y se documentaron los riesgos que dependen de integración con sistemas externos ATLAS.

## Hallazgos de largo plazo corregidos

| Hallazgo                                                                | Riesgo a largo plazo                                                                       | Corrección aplicada                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validaciones financieras fuertes dependían demasiado del service        | El controller podía aceptar payloads incoherentes y fallar tarde, dificultando diagnóstico | Se reforzaron schemas Zod para compra BNPL, facturas, pagos, contratos, calificación y etapas perdidas                                                      |
| Compra BNPL permitía cuotas que no cuadraban con el monto financiado    | Descuadre entre compra, calendario de cuotas, CxP y conciliación                           | Se exige que `downPaymentAmount` sea 60%, `financedAmount` sea 40%, la suma de cuotas coincida y no existan cuotas duplicadas                               |
| Pagos comercio permitían monto no asignado sin modelo de saldo a favor  | Dinero parcialmente flotante sin trazabilidad contable                                     | Se exige que la suma de asignaciones coincida con el monto del pago hasta implementar saldo no aplicado                                                     |
| Facturación podía aceptar CxC duplicadas, ya facturadas o no pendientes | Doble facturación, errores fiscales y conciliaciones falsas                                | Se validan duplicados, fechas y estado `PENDING`; además se bloquean filas durante facturación                                                              |
| Contactos principales podían duplicarse                                 | Ambigüedad operativa para decisiones comerciales                                           | Al crear contacto principal se desmarca el anterior dentro de transacción y se agregó índice único parcial                                                  |
| Usuarios comercio podían duplicarse por email/cuenta                    | Confusión de permisos operativos                                                           | Se valida duplicado y se agregó índice único case-insensitive por cuenta/email                                                                              |
| Propuesta aceptada podía duplicarse por oportunidad                     | Contratos paralelos para la misma negociación                                              | Se bloquea aceptar otra propuesta si ya hay una aceptada para la oportunidad                                                                                |
| Una propuesta aceptada podía transformarse en más de un contrato        | Doble contrato activo sobre el mismo negocio                                               | Se rechaza crear contrato si la oportunidad ya tiene contrato no terminado                                                                                  |
| Onboarding permitía múltiples casos abiertos por cuenta                 | Activaciones ambiguas y checklist duplicado                                                | Se rechaza crear un nuevo caso si ya existe uno abierto/en progreso/bloqueado                                                                               |
| Operaciones de pago/cobertura/recuperación no bloqueaban filas críticas | Condiciones de carrera ante doble click, reintentos o procesamiento concurrente            | Se agregaron locks transaccionales en CxC, CxP, cuotas y recuperaciones                                                                                     |
| Recuperación consumidor se actualizaba sin transacción                  | Riesgo de sobre-recuperación concurrente                                                   | `applyRecoveryPayment` ahora usa transacción y lock de fila                                                                                                 |
| Conciliación revisaba CxP pagadas fuera del período                     | Repetición de hallazgos históricos en cada corrida                                         | Se limita la revisión de recuperaciones faltantes a CxP pagadas dentro del período                                                                          |
| Migraciones no reforzaban idempotencia operativa                        | Reintentos podían duplicar CxC, pagos externos o items de conciliación                     | Se agregaron índices únicos parciales para contacto principal, usuarios comercio, origen de CxC, pagos con referencia externa y diferencias de conciliación |
| Docker no podía ejecutar migraciones productivas sin devDependencies    | Imagen final no tenía `tsx`, pero los scripts de migración dependían de él                 | Se compilan scripts a `dist/scripts` y se agregan `db:migrate:prod` / `db:seed:prod`                                                                        |
| Docker corría como root y sin healthcheck                               | Menor seguridad operativa y peor observabilidad de contenedor                              | Se cambió a usuario `node` y se agregó `HEALTHCHECK`                                                                                                        |
| Tests de schemas cubrían pocos casos negativos                          | Reglas críticas podían romperse sin alerta                                                 | Se ampliaron tests unitarios de validaciones críticas de negocio                                                                                            |

## Riesgos que siguen fuera del ZIP y requieren integración ATLAS

| Riesgo                                                                      | Por qué no se corrige dentro del ZIP                                                   | Mitigación antes de producción real                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Auth real de ATLAS no está incluido                                         | El módulo asume JWT Bearer con payload `{ sub, roleCode }`                             | Conectar `JwtAuthGuard` al AuthModule real o al IdP oficial                                                                   |
| Core BNPL externo no está conectado                                         | No se recibió contrato técnico del core                                                | Agregar adapter para validar consumidor, línea disponible y aprobación real antes de confirmar compra                         |
| SIN/ERP no está conectado                                                   | No se recibió API fiscal/ERP                                                           | Agregar adapter fiscal y persistir respuesta fiscal real antes de considerar factura emitida legalmente                       |
| No hay PostgreSQL real en sandbox                                           | El entorno de auditoría no levanta una base ATLAS viva                                 | Ejecutar migración, seed y smoke test en local/CI con Postgres real                                                           |
| Service B2B sigue siendo grande                                             | Refactor completo por bounded contexts requiere más ciclo y más pruebas de integración | Dividir luego en services especializados: Accounts, Pipeline, Contracts, Onboarding, BNPL, Billing, Coverage y Reconciliation |
| Migraciones SQL son idempotentes pero no versionadas con tabla de historial | El runner actual aplica archivos SQL sin llevar ledger propio                          | Adoptar Umzug/Sequelize CLI o tabla `schema_migrations` antes de múltiples releases productivos                               |

## Verificación contra prompts base

- Se mantiene NestJS + TypeScript como framework y lenguaje del backend.
- Sequelize sigue siendo el ORM central.
- Zod valida entradas externas.
- JWT Bearer está encapsulado en guard reutilizable.
- Controllers siguen delgados.
- No hay `express.Router` ni backend Express puro.
- No se usa `sequelize.sync({ force: true })` ni `sequelize.sync({ alter: true })`.
- La API conserva prefijo versionado `api/v1`.
- Existen docs de endpoints, arquitectura, flujos, OpenAPI, Postman, prompts y progreso.
- Se agregaron pruebas adicionales para reglas financieras críticas.
- Se reforzó despliegue Docker con usuario no root, healthcheck y scripts productivos compilados.

## Checks ejecutados en este ciclo

```bash
npm run type-check
npm run build
npm run lint
npm run test -- --runInBand
npm run test:e2e
npm audit --omit=dev
npx prettier --check .
```

Los logs quedaron guardados en `docs/progress/checks/` para revisión técnica.

## Veredicto

El entregable queda más sólido para producción controlada que la versión previa. Ya no solo pasa checks técnicos: también reduce riesgos de duplicidad, carrera, pagos incoherentes, facturación inconsistente y despliegue incompleto.

La única afirmación que no sería honesta es decir que está probado end-to-end contra infraestructura real de ATLAS, porque falta PostgreSQL real, Auth real, Core BNPL real y ERP/SIN real. El ZIP sí queda listo para esa integración y validación.
