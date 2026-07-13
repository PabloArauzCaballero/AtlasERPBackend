# Auditoría línea por línea - Módulo B2B CRM/Ventas

## 1. Alcance

Se revisó el ZIP actual archivo por archivo contra los lineamientos de `prompt/index.md`, `prompt/programacionGeneral.md` y `prompt/programacionBackend.md`.

La revisión cubrió:

- Estructura de carpetas y `README.md` por carpeta importante.
- Controllers, guards, pipes, filters, interceptors y logging con Pino.
- Services, transacciones, reglas de negocio, validaciones y mappers.
- Repositories, modelos Sequelize y migración SQL.
- Documentación de endpoints, OpenAPI, Postman y reportes de progreso.
- Scripts operativos, smoke tests, lint, build, type-check, unit tests, e2e y auditoría npm.

## 2. Hallazgos corregidos

| Hallazgo                                                                                | Riesgo a largo plazo                                                                                | Corrección aplicada                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| La tabla `consumer_payments_to_merchant` existía en SQL, pero no tenía modelo Sequelize | Desalineación entre base de datos y código; riesgo de no trazar el pago inicial consumidor→comercio | Se agregó `ConsumerPaymentToMerchantModel`, se registró en `atlasSalesModels` y en el repository |
| La compra BNPL no persistía explícitamente el pago inicial del consumidor al comercio   | Pérdida de trazabilidad operativa entre compra, comercio y consumidor                               | `registerPurchase` ahora crea un registro en `consumer_payments_to_merchant`                     |
| Fechas `YYYY-MM-DD` solo se validaban por regex                                         | Fechas imposibles como `2026-02-30` podían pasar validación                                         | Se agregó validación real de calendario con Zod                                                  |
| Monedas ISO podían entrar en minúsculas                                                 | Inconsistencia de datos (`bob` vs `BOB`)                                                            | Se normaliza moneda a mayúsculas desde schema Zod                                                |
| `X-Request-Id` aceptaba cualquier string                                                | Logs con valores enormes o no seguros                                                               | Se restringió a caracteres seguros y 120 caracteres máximo; si no cumple se genera UUID          |
| Scripts operativos usaban `console.*`                                                   | Observabilidad inconsistente con el estándar Pino                                                   | `run-sql-migration.ts` y smoke test ahora usan Pino                                              |
| Faltaban `README.md` en `scripts`, `scripts/smoke` y checks nuevos                      | Menor mantenibilidad para operación                                                                 | Se agregaron README específicos                                                                  |
| `b2b-sales-crm.service.ts` era una clase monolítica grande                              | Riesgo serio de mantenimiento, regresiones y mezcla de subdominios                                  | Se separó en services por subdominio y se dejó una fachada estable para controllers              |

## 3. División final de services

- `b2b-sales-crm.service.ts`: fachada.
- `b2b-accounts.service.ts`: cuentas, contactos y calificación.
- `b2b-pipeline.service.ts`: oportunidades, propuestas y aprobaciones.
- `b2b-contracts.service.ts`: contratos.
- `b2b-onboarding.service.ts`: onboarding, sucursales y usuarios merchant.
- `b2b-bnpl-billing.service.ts`: compra BNPL, MDR, facturación y pagos.
- `b2b-coverage.service.ts`: cobertura ATLAS→comercio y recuperación consumidor.
- `b2b-reconciliation.service.ts`: conciliación.
- `b2b-sales-crm-use-case.base.ts`: reglas compartidas de cálculo.

## 4. Validaciones ejecutadas

```bash
npm run type-check
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e
npm audit --omit=dev
npx prettier --check .
```

Además se validó:

- JSON válido en `package.json`, `package-lock.json` y Postman collection.
- YAML válido en `docs/endpoints/openapi.yaml`.
- Paridad entre tablas SQL y modelos Sequelize.
- Ausencia de carpetas importantes sin `README.md`.
- Ausencia de `console.*`, `debugger`, `TODO`, `FIXME`, `@ts-ignore`, `@ts-expect-error`, `any` en código fuente operativo.

## 5. Resultado

El módulo queda más ordenado, observable y mantenible a corto y largo plazo. La revisión no encontró fallas pendientes que impidan build, lint, type-check, tests o auditoría npm.

## 6. Limitación honesta

No se ejecutó migración ni smoke test contra PostgreSQL real porque el entorno de auditoría no dispone de una base de datos PostgreSQL configurada. Esa validación debe ejecutarse en el entorno local o staging con `.env` real.
