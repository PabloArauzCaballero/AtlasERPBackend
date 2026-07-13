# Auditoría de calidad de despliegue y endurecimiento SAP-like

## 1. Resultado ejecutivo

El módulo fue auditado y endurecido para despliegue como backend NestJS independiente. El objetivo del ciclo fue elevarlo desde una implementación funcional a una base más cercana a un estándar SAP-like liviano: mayor universal, submayores, BP central, períodos cerrables, controles de posting, inmutabilidad contable y separación entre origen operativo, documento fiscal y asiento.

Estado actual: **apto para revisión técnica de despliegue**. En este ciclo se ejecutó `npm run check:deploy` correctamente: type-check, lint, tests, build y auditoría de dependencias pasaron. Queda pendiente ejecutar `db:prepare` y smoke test contra una base PostgreSQL real del ambiente destino.

## 2. Hallazgos principales de auditoría

| Hallazgo                                                                         | Riesgo                                                                      | Corrección aplicada                                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| El modelo tenía validación de doble partida en service, pero no en base de datos | Un bypass al API podía insertar líneas descuadradas                         | Se agregó trigger diferido `trg_journal_balanced` en `002_hardening_atlas_accounting.sql`                                    |
| La inmutabilidad dependía principalmente de la capa de servicio                  | Un acceso directo a DB podía alterar asientos publicados                    | Se agregaron triggers de bloqueo para documentos/asientos/líneas publicados y bitácora                                       |
| El cierre solo bloqueaba documentos DRAFT                                        | Podía cerrar con conciliaciones bancarias abiertas                          | Se agregó `ClosingControlService` con bloqueo por documentos DRAFT, conciliaciones abiertas y líneas bancarias unmatched     |
| Ledger, entidad legal y período se validaban parcialmente                        | Riesgo de asientos en ledger/período incorrecto                             | Se agregó `SapPostingValidationService` y trigger `fn_assert_accounting_document_context`                                    |
| Las cuentas GL no exigían dimensiones SAP-like desde DB                          | Se podían omitir partner, centro de costo, profit center o tax code         | Se agregó validación en service y trigger `fn_assert_journal_line_dimensions`                                                |
| Facturación AR no validaba suficientemente BP/contrato/impuestos                 | Riesgo de facturas contra contraparte o contrato incorrecto                 | Se validan roles BP, contrato, impuesto y trazabilidad SIAT aceptada                                                         |
| Recibos no verificaban que las asignaciones sumaran el monto ni saldos abiertos  | Riesgo de sobrepago o diferencias AR                                        | Se valida suma exacta, factura abierta, saldo disponible y actualización de estado                                           |
| Faltaba ruta operativa versionada para preparar DB                               | Riesgo de despliegue manual inconsistente y re-ejecución de SQL estructural | Se agregó runner de migraciones con `db:migrate`, `db:migrate:status`, `db:rollback`, `db:seed` y `db:prepare`               |
| Variables de entorno aceptaban secretos débiles en producción                    | Riesgo de configuración insegura                                            | `env.ts` ahora rechaza secreto por defecto, wildcard CORS y DB sin SSL en producción                                         |
| `start:prod`/Docker podían apuntar a ruta de build incorrecta                    | El contenedor podía compilar pero no arrancar                               | Se agregó `tsconfig.build.json`; `dist/main.js` y `dist/workers/...` quedan en rutas estables                                |
| El outbox no tenía consumidor                                                    | Crecimiento indefinido de eventos y deuda operativa                         | Se agregó worker persistente `worker:outbox` con `FOR UPDATE SKIP LOCKED`                                                    |
| Existía riesgo de doble reversión                                                | Estados financieros duplicados o distorsionados                             | Se agregó lock transaccional, índice único parcial y transición controlada `POSTED -> REVERSED`                              |
| El cierre no verificaba entidad legal del período                                | Cierre multi-entidad incorrecto                                             | Se agregó validación en service y trigger `trg_close_run_context`                                                            |
| Las asignaciones AR podían sufrir carrera concurrente                            | Sobrepago por requests simultáneos                                          | Se agregaron locks de factura y trigger de saldo abierto                                                                     |
| Dependencias productivas tenían vulnerabilidades                                 | Riesgo de seguridad y bloqueo de auditoría                                  | Se actualizó NestJS y se agregó override seguro de `uuid`; `npm audit --omit=dev` queda en cero                              |
| `posting_rule_version` no participaba en el flujo                                | Cambios futuros de reglas podían perder trazabilidad                        | Se agregó `PostingRuleSnapshotService` y `accounting_document.policy_snapshot_id` se llena con la regla activa cuando existe |

## 3. Endurecimiento SAP-like aplicado

### 3.1 Posting y mayor universal

- `SapPostingValidationService` valida período abierto, fecha de contabilización dentro del período, ledger activo, ledger de la entidad correcta, cuentas activas y dimensiones obligatorias.
- `DoubleEntryValidator` mantiene validación en aplicación.
- `002_hardening_atlas_accounting.sql` agrega validación diferida en base de datos para impedir asientos descuadrados.

### 3.2 Cuentas de control y submayores

Las cuentas marcadas como `is_control_account` ya no pueden usarse sin referencia de submayor válida. Esto evita el error clásico de contabilizar directamente contra CxC/CxP/bancos/deuda sin trazabilidad operativa.

Referencias de submayor aceptadas:

- `AR_INVOICE`
- `AP_INVOICE`
- `RECEIPT`
- `SUPPLIER_PAYMENT`
- `LOAN`
- `ASSET`
- `PROVISION`
- `REVERSAL`
- `INTERCOMPANY`

### 3.3 Business Partner central

Se agregó `BusinessPartnerRoleValidationService` para impedir que una contraparte participe en procesos sin rol activo. Ejemplos:

- Factura AR: `CUSTOMER`, `MERCHANT` o `INTERCOMPANY`.
- Recibo: `CUSTOMER`, `MERCHANT` o `INTERCOMPANY`.
- Contrato de préstamo: `LENDER` o `BANK`.
- Contrato intercompany: `INTERCOMPANY`.

### 3.4 Inmutabilidad y reversos

La regla operativa queda reforzada en dos capas:

1. En el servicio, solo se permite reversar documentos `POSTED` mediante un nuevo documento inverso.
2. En base de datos, triggers bloquean cambios directos sobre documentos, asientos y líneas publicados.

### 3.5 Cierre de período

El cierre ahora falla si existen:

- Documentos contables DRAFT.
- Ítems de conciliación abiertos en el período.
- Líneas de extracto bancario sin matching o aprobación de excepción.

Los eventos outbox pendientes quedan reportados en `controlReportJson`, pero no bloquean el cierre contable porque son integración, no integridad del mayor.

### 3.6 Factura fiscal separada

La emisión AR conserva la separación entre:

- `billing_event`: hecho comercial facturable.
- `ar_invoice`: factura comercial/cuenta por cobrar.
- `electronic_tax_document`: trazabilidad SIAT.
- `accounting_document`: asiento contable.

Si el documento fiscal electrónico llega como `ACCEPTED`, se exige CUF, CUFD, hash XML y fecha de emisión.

## 4. Checklist de despliegue

Ejecutar en el ambiente destino:

```bash
yarn install
yarn db:prepare
yarn check:deploy
yarn start:prod
```

Para validar disponibilidad:

```bash
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/ready
```

Para smoke test:

```bash
yarn smoke:accounting
```

## 5. Variables críticas de producción

| Variable               | Requisito                                        |
| ---------------------- | ------------------------------------------------ |
| `NODE_ENV`             | `production`                                     |
| `DATABASE_URL`         | PostgreSQL real con usuario restringido          |
| `DB_SSL`               | `true`, salvo despliegue interno documentado     |
| `JWT_ACCESS_SECRET`    | secreto fuerte, no usar valor del `.env.example` |
| `CORS_ALLOWED_ORIGINS` | lista explícita, nunca `*` con credenciales      |
| `BODY_LIMIT`           | límite conservador, por defecto `1mb`            |

## 6. Limitaciones honestas

- Se ejecutó `npm run check:deploy` correctamente en este entorno. No se ejecutó `db:prepare` porque no hay PostgreSQL de destino configurado en el sandbox.
- El worker outbox publica localmente y marca `published_at`. Si ATLAS define Kafka, SNS, webhooks o pg-boss, solo debe reemplazarse `publishEvent` en `src/workers/outbox/outbox.worker.ts`.
- La integración SIAT externa real requiere credenciales, endpoints y política de contingencia del ambiente tributario. Esta entrega valida trazabilidad fiscal cuando se registra un documento aceptado, pero no firma ni transmite XML a SIAT sin esa información externa.

## 7. Veredicto

El diseño queda bastante más fuerte que antes para despliegue: tiene controles de aplicación, controles de base de datos, validaciones de roles BP, cierre con checklist, migraciones versionadas, worker outbox, auditoría de dependencias y documentación de auditoría. No es una copia pesada de SAP; es un núcleo SAP-like amplio pero operativamente liviano.
