# Runbook de restore del ERP (ensayo P-17)

Cómo restaurar la base del ERP desde un volcado y **demostrar** que los libros quedaron idénticos,
sin reenviar eventos ya publicados. Complementa `docs/compliance/decisions.md` (## P-17).

> **BLOCKED (fuera de este ensayo):** RPO/RTO **aprobados** · restore de los archivos del
> almacenamiento de objetos que referencia `atlas_accounting.erp_file` · credenciales efectivas del
> entorno · ejecución por una persona **distinta del autor**. Lo de abajo es local y sintético.

## 1. Ensayo automatizado (local, sintético)

```bash
yarn build
PG_CONTAINER=<contenedor propio> yarn ops:restore-drill   # PG_PORT, API_PORT, LOAD_S configurables
```

Recorre, y sale con código ≠ 0 si algo no cuadra:

1. Base ORIGEN migrada con `yarn db:migrate:prod` (el migrador del despliegue).
2. Ciclo financiero por la API compilada (`scripts/perf/financial-load.ts`): cobertura, liquidación
   con doble control, recuperación, puente factura→mayor y asiento POSTED; 1 de cada 5 CxP queda sin
   liquidar y 1 de cada 3 recuperaciones queda parcial, para que haya saldos abiertos que conciliar.
3. Outbox con los tres estados: el worker real entrega a un receptor local
   (`scripts/ops/outbox-receiver.mjs`, verifica la firma HMAC) que rechaza con 422 uno de cada cinco
   eventos (→ DEAD) y acepta el resto (→ PUBLISHED); otra tanda de carga deja eventos PENDING.
4. `scripts/ops/erp-reconciliation.sql` sobre el ORIGEN → `pg_dump -Fc` → base nueva →
   `pg_restore --exit-on-error` → misma conciliación sobre la RESTAURADA; `diff` vacío.
5. El worker contra la RESTAURADA con un receptor nuevo: debe entregar **exactamente** los PENDING
   entregables y ninguno PUBLISHED ni DEAD.

La conciliación (≈ 90 controles) incluye: conteo y md5 del contenido completo de 23 tablas (compras,
cuotas, CxP, liquidaciones, CxC de recuperación, movimientos, facturas, CxC a comercios, documentos,
asientos y líneas, archivos, outbox, inbox…), CxP/liquidaciones/CxC/movimientos por estado con sus
importes, debe y haber por cuenta (todas y sólo contabilizadas), `debe − haber` total, asientos
descuadrados, saldos de CxP abierta, CxC de recuperación y CxC a comercios, duplicados por cuota,
por CxP y por referencia de cobro, y la secuencia del outbox.

### Resultado medido

Ver la sección 4.

## 2. Restore real (procedimiento)

1. **Aislar.** Restaurar en una base NUEVA; nunca encima de la vigente. Worker del outbox detenido
   (`OUTBOX_WORKER_ENABLED=false` o sin arrancar) y API sin tráfico hasta el paso 6.
2. **Restaurar.** `pg_restore -d <base_nueva> --exit-on-error <volcado>`.
3. **Ledger de migraciones.** `public.atlas_sql_migrations` viaja en el volcado: `yarn
db:migrate:prod` contra la copia debe ser un no-op. Si aplica algo, la copia es de una versión
   anterior: aplicar hacia adelante, nunca editar el ledger.
4. **Conciliar.** `psql -tA -f scripts/ops/erp-reconciliation.sql` contra la copia y contra la
   última conciliación registrada del origen. `balance_debe_menos_haber` y `asientos_descuadrados`
   deben ser 0; cualquier diferencia se investiga antes de abrir tráfico. **No** se corrige la
   diferencia tocando movimientos: se documenta y se decide (criterio de detención del plan, §9).
5. **Outbox.** Anotar `SELECT status, count(*) FROM atlas_accounting.event_outbox GROUP BY 1`.
   El worker sólo entrega PENDING. PUBLISHED no se reenvía. DEAD no se reenvía solo: se revisa y se
   reenvía con `POST /api/v1/accounting/outbox/events/:eventKey/replay`, uno a uno y con motivo.
   **Orden por agregado:** un PENDING cuya versión anterior del mismo agregado está DEAD no se
   entrega hasta reenviar ese DEAD (en el ensayo, 137 de 387 PENDING quedaron así, igual en el
   origen que en la copia). La entrega es _at-least-once_: un evento entregado después del volcado
   se entregará otra vez, y lo absorbe la inbox del consumidor (`consumeOnce`).
6. **Arrancar** API y worker; `GET /api/v1/accounting/outbox/status` (edad del pendiente más
   antiguo) y `GET /api/v1/health`.
7. **Registrar** el tiempo de cada paso: es el RTO medido.

## 3. Rollback de migraciones

Corrección hacia adelante (`docs/compliance/decisions.md`, ## P-17). Las reversas del 2026-09-24
están probadas contra una base con hechos en
`test/migrations-rollback-preserva-hechos.integration.spec.ts`:

| Migración                                           | Reversa                                                                                      | ¿Destruye hechos? |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `20260924100000-outbox-entrega-real`                | Quita trigger de versión y CHECK de estado; conserva columnas e inbox                        | No                |
| `20260924200000-cobertura-elegibilidad-liquidacion` | Se **niega** si hay liquidaciones, cobros, revisiones o CxP canceladas; si no, tablas vacías | No (se niega)     |
| `20260924300000-p06-origen-contable-unico`          | Sólo índices                                                                                 | No                |
| `20260924300100-p07-mdr-de-la-compra`               | Sólo el CHECK; conserva la instantánea de MDR                                                | No                |

Revertir la **aplicación** a antes de P-03 exige aplicar antes la reversa del outbox (el worker
anterior asigna `published_at` sin `status` y violaría el CHECK). Para deshacer un efecto de
negocio se escribe una migración nueva; `run-sql` ejecuta cada archivo en una transacción, así que
una migración que falla no deja nada a medias y el ledger no la marca aplicada.

## 4. Resultados registrados

| Fecha      | SHA                              | Máquina                       | Volcado        | Restore | RTO (restore + conciliación) | Conciliación           | Outbox tras restaurar                                                                                                                               |
| ---------- | -------------------------------- | ----------------------------- | -------------- | ------: | ---------------------------: | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-24 | `51bc9ed` + cambios de P-16/P-17 | Apple M5, Docker Desktop, dev | 209 ms, 1,5 MB |  722 ms |    **847 ms** (sólo la base) | 91 controles idénticos | 250/250 PENDING entregables entregados, 137 detrás de un DEAD sin entregar (como en el origen), 0 PUBLISHED ni DEAD reenviados, 0 duplicados, 1,2 s |

Datos del ensayo: 536 ciclos; 440 CxP pagadas y 96 abiertas (28.800,00); 440 liquidaciones
confirmadas; 309 recuperaciones completas y 131 parciales (CxC abierta 26.200,00); 749 cobros
(105.800,00); 536 documentos y asientos POSTED con `debe − haber = 0,00`; outbox 1.517 PUBLISHED,
357 DEAD y 387 PENDING. El RTO medido es el de la base de un ensayo (1,5 MB): no incluye reponer
secretos, arrancar servicios ni el almacenamiento de objetos, y crece con el tamaño real.
