# Flujos del módulo contable

## 1. Crear documento contable draft

1. Controller recibe body validado por Zod.
2. Service valida que el período esté abierto.
3. `DoubleEntryValidator` exige:
   - cada línea tiene débito o crédito, nunca ambos.
   - total débito = total crédito.
4. Se crea `accounting_document`.
5. Se crea `journal_entry`.
6. Se crean `journal_entry_line`.
7. Se registra auditoría.
8. Se crea evento en `event_outbox`.

## 2. Publicar documento

1. Se busca el documento.
2. Se exige estado `DRAFT`.
3. Se valida período abierto.
4. Se recalcula cuadratura.
5. Se genera hash SHA-256 del asiento.
6. Se marca documento `POSTED`.
7. Se marca journal `POSTED`.
8. Se registra auditoría y outbox.

## 3. Reversar documento

1. Se exige documento original `POSTED`.
2. Se leen sus líneas.
3. Se crea un nuevo documento de reverso.
4. Se intercambian débito y crédito.
5. Se publica el documento de reverso.
6. No se edita el asiento original.

## 4. Emitir factura AR

1. Se crea `ar_invoice`.
2. Se crea `ar_invoice_line`.
3. Opcionalmente se crea `electronic_tax_document`.
4. Se genera asiento automático:
   - Dr CxC por gross amount.
   - Cr ingreso por net amount.
   - Cr IVA débito si aplica.
5. Se publica el asiento en la misma transacción.

## 5. Registrar recibo

1. Se crea `receipt`.
2. Se crean `receipt_allocation`.
3. Se genera asiento automático:
   - Dr Banco.
   - Cr CxC.
4. Se publica el asiento en la misma transacción.

## 6. Cierre de período

1. CFO/Admin solicita cierre.
2. Se valida que no existan documentos `DRAFT`.
3. Se crea `close_run`.
4. Se marca el período como cerrado.
5. Se emite outbox `accounting.period.closed`.

## 7. Worker pendiente

El diseño deja `event_outbox` listo. La fase siguiente debe implementar un worker persistente separado del API, con apagado controlado, concurrencia, reintentos e idempotencia.

## Flujo endurecido de posting contable

1. El controller recibe la solicitud protegida por JWT y roles.
2. `ZodValidationPipe` valida body, params o query.
3. El service abre transacción Sequelize.
4. `DoubleEntryValidator` verifica que cada línea tenga débito o crédito y que el asiento cuadre.
5. `SapPostingValidationService` valida período, ledger, entidad legal, cuentas y dimensiones.
6. Se crea `accounting_document` en DRAFT.
7. Se crea `journal_entry` en DRAFT.
8. Se insertan `journal_entry_line`.
9. Se registra `document_audit_log`.
10. Se registra evento en `event_outbox`.
11. Al publicar, se recalcula balance, se genera hash SHA-256 y se actualiza estado a POSTED.
12. Desde ese momento, triggers de base de datos bloquean edición directa.

## Flujo endurecido de factura AR

1. Se valida BP con rol activo `CUSTOMER`, `MERCHANT` o `INTERCOMPANY`.
2. Si existe contrato, se valida entidad legal, contraparte y estado contractual.
3. Si hay impuesto, se exige cuenta fiscal pasiva y tax code.
4. Si el documento fiscal está aceptado por SIAT, se exige CUF, CUFD, hash XML y fecha de emisión.
5. Se crea `ar_invoice`.
6. Se crea `ar_invoice_line`.
7. Se crea opcionalmente `electronic_tax_document`.
8. Se genera asiento AR automático contra CxC, ingreso e impuesto.

## Flujo endurecido de recibo

1. Se valida BP con rol activo compatible.
2. Se valida que la suma de asignaciones sea igual al monto del recibo.
3. Se valida que cada factura AR exista, pertenezca al pagador y tenga saldo abierto suficiente.
4. Se crea `receipt`.
5. Se crean `receipt_allocation`.
6. Se actualiza estado de factura AR a `PAID` o `PARTIALLY_PAID`.
7. Se genera asiento automático banco contra CxC.

## Flujo endurecido de cierre

1. CFO o admin solicita cierre.
2. Se valida que el período exista y esté abierto.
3. `ClosingControlService` calcula controles.
4. Si existen bloqueos, se rechaza con `PERIOD_CLOSE_CONTROLS_FAILED`.
5. Si no hay bloqueos, se crea `close_run` con `control_report_json`.
6. Se marca el período como cerrado.
7. Se emite evento outbox `accounting.period.closed`.

## Flujo endurecido de reverso contable

1. El controller valida `id` y body con Zod.
2. El service abre una transacción.
3. El documento original se bloquea con `FOR UPDATE`.
4. Se valida alcance por entidad legal.
5. Se verifica que el documento original esté `POSTED`.
6. Se busca reverso activo; si existe, se rechaza para evitar doble reversión.
7. Se crea documento reverso en `DRAFT` con débitos y créditos invertidos.
8. Se publica el reverso, calculando hash SHA-256.
9. El documento original queda `REVERSED` y apunta a `reversed_by_id`.
10. Se registra auditoría y evento outbox.

## Flujo endurecido de recibo AR

1. Se valida alcance por entidad legal.
2. Se valida rol activo del pagador.
3. Se agrupan asignaciones por factura.
4. Cada factura AR se bloquea con `FOR UPDATE`.
5. Se calcula saldo abierto dentro de la transacción.
6. Se rechaza la sobreasignación.
7. Se crea recibo, asignaciones y asiento.
8. Se actualiza estado de factura a `PARTIALLY_PAID` o `PAID`.

## Worker outbox persistente

El worker `src/workers/outbox/outbox.worker.ts` corre como proceso separado del API HTTP.

```bash
npm run worker:outbox
```

Ciclo:

1. conecta a PostgreSQL;
2. lee eventos con `published_at IS NULL`;
3. usa `FOR UPDATE SKIP LOCKED`;
4. publica el evento;
5. marca `published_at`;
6. espera si no hay trabajo;
7. maneja `SIGINT`/`SIGTERM`.

## Flujo de smoke test con resultado JSON

1. `scripts/smoke/accounting.smoke.ts` arma un JWT temporal para endpoints protegidos.
2. Ejecuta `/health`, `/ready` y una creación mínima de entidad legal.
3. Cada paso registra resultado con Pino.
4. El reporte completo se guarda siempre en `scripts/smoke/accounting-smoke-result.json`.
5. Si algún paso falla, el script deja `process.exitCode = 1` sin perder el JSON de diagnóstico.

Este comportamiento permite adjuntar evidencia automática en CI/CD aunque el smoke falle.
