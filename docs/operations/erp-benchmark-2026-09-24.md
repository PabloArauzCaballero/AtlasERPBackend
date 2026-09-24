# Carga de las rutas financieras del ERP — 2026-09-24 (P-16)

> **Esto es un Mac de desarrollo compartido, no un SLO de producción.** Una máquina, con
> PostgreSQL en Docker Desktop en la misma máquina y otras sesiones trabajando a la vez (carga media
> 4–6). Las cifras sirven para comparar escenarios y fijar un límite operativo inicial respaldado
> por medición; el SLO se acuerda y se mide en el entorno objetivo (BLOCKED, ver al final).

## Qué se midió

| Campo     | Valor                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHA       | `51bc9ed` + los cambios de este paquete (límite del `ThrottlerGuard` configurable, mismo valor por omisión); commit de la rama `cumplimiento/operacion`                             |
| Máquina   | Apple M5, 10 núcleos, 16 GB; macOS 26.5.2; Docker 29.6.2; Node 22.23.2                                                                                                              |
| Servicio  | `node dist/src/main.js` (API compilada, un proceso), `NODE_ENV=test`, `LOG_LEVEL=warn`                                                                                              |
| Base      | `postgres:16-alpine` efímero y propio, migrado con `yarn db:migrate:prod` (el migrador del despliegue)                                                                              |
| Limitador | `HTTP_RATE_LIMIT_PER_MINUTE=1000000` para medir capacidad; el escenario «throttle» usa el valor por omisión (120/min por IP)                                                        |
| Datos     | Sintéticos: comercio, contrato ACTIVO, compra y cuota de 300,00 vencida (SQL, como `test/support/coverage-fixtures.ts`); entidad, período abierto, cuentas y factura por trabajador |

Cada iteración de un trabajador es un **ciclo completo por HTTP** con dos personas distintas
(JWT con `sub` diferentes; la liquidación exige doble control):

1. `POST /b2b/coverage/payables` **dos veces a la vez** sobre la misma cuota (esperado: un 201 y un 409).
2. `PATCH /b2b/coverage/payables/:id/paid` (persona A, con evidencia) → 202.
3. `PATCH /b2b/coverage/payables/:id/settlement/approve` (persona B) → nace la CxC de recuperación.
4. `PATCH /b2b/coverage/recoveries/:id/apply-payment` 100,00 + 200,00 y **repetición** del primero.
5. `PATCH /b2b/billing/invoices/:id/post-to-gl` **dos veces a la vez** (esperado: el mismo documento).
6. `PATCH /accounting/documents/:id/post` (persona B) → asiento POSTED.

Reproducir:

```bash
yarn build
PG_CONTAINER=<contenedor propio> bash scripts/perf/financial-bench.sh
# sólo el generador, contra una API ya levantada y su base:
DATABASE_URL=… JWT_ACCESS_SECRET=… yarn perf:financial --base-url http://127.0.0.1:3007/api/v1 \
  --concurrency 4 --duration 180 --pid <pid API> --out r.json
```

Al final de cada escenario el generador corre las consultas de **conciliación** (deben dar 0) y
sale con código ≠ 0 si alguna no da cero.

## Resultados

Latencias por paso en ms (p50 / p95 / p99). «Técnicos» = 5xx o sin respuesta; los 409/429
esperados no cuentan como técnicos.

| Escenario      | Ciclos/s | Peticiones/s | Cobertura     | Liquidar     | Aprobar      | Cobro        | Puente        | Contabilizar | Técnicos | RSS (MB)  |
| -------------- | -------: | -----------: | ------------- | ------------ | ------------ | ------------ | ------------- | ------------ | -------: | --------- |
| c=1, 45 s      |     11,6 |        116,2 | 10 / 16 / 26  | 6 / 10 / 16  | 9 / 13 / 20  | 6 / 9 / 14   | 21 / 33 / 51  | 10 / 15 / 24 |        0 | 162 → 291 |
| c=4, 45 s      |     17,3 |        172,8 | 26 / 51 / 92  | 16 / 30 / 42 | 23 / 41 / 62 | 15 / 31 / 48 | 54 / 97 / 146 | 26 / 46 / 67 |        0 | 292 → 358 |
| c=8, 45 s      |     23,1 |        231,3 | 41 / 68 / 103 | 31 / 55 / 67 | 37 / 60 / 80 | 31 / 56 / 73 | 65 / 98 / 125 | 41 / 66 / 98 |        0 | 358 → 385 |
| **c=4, 180 s** | **17,4** |    **174,2** | 27 / 46 / 75  | 15 / 26 / 43 | 22 / 36 / 59 | 15 / 28 / 49 | 55 / 88 / 150 | 26 / 44 / 78 |    **0** | 385 → 354 |

Sostenida (c=4, 3 min): 3.140 ciclos, 31.400 peticiones, 3.140 CxP, 3.140 CxC de recuperación,
6.280 cobros, 3.140 documentos contabilizados, **0** errores técnicos; memoria estable
(385 → 386 máx → 354 MB).

### Duplicados bajo concurrencia

| Comprobación                                                 |     c=1 |     c=4 |         c=8 | c=4 · 180 s |
| ------------------------------------------------------------ | ------: | ------: | ----------: | ----------: |
| Parejas de cobertura simultánea con exactamente un 201 + 409 | 523/523 | 779/779 | 1.046/1.046 | 3.140/3.140 |
| Parejas del puente que devolvieron el mismo documento        | 523/523 | 779/779 | 1.046/1.046 | 3.140/3.140 |
| Repetición del cobro: 200 sin volver a sumar                 |     523 |     779 |       1.046 |       3.140 |

### Conciliación tras la carga (todas = 0 en todos los escenarios)

CxP vivas duplicadas por cuota · CxC de recuperación duplicadas por CxP · cobros duplicados por
referencia · `amount_recovered` distinto de la suma de movimientos · liquidaciones vivas duplicadas
por CxP · documentos contables duplicados por factura · asientos con debe ≠ haber · `event_key`
duplicado en el outbox.

### Límite por omisión (c=2, 20 s, 120/min por IP)

58 ciclos completos; **3.476 × 429** en la cobertura y 60 × 429 en cobros, **0 técnicos**. Donde
un 429 cortó un ciclo a medias (cobro de 100 aplicado y el de 200 limitado), la conciliación sigue
en 0: `amount_recovered` = suma de movimientos.

**Hallazgo (para S):** el rastreador del limitador es la IP y la API no declara `trust proxy`.
Detrás de Traefik todos los usuarios comparten la IP del proxy: 120/min es un cupo **global** de
2 peticiones/s para toda la consola. Hoy el límite estaba fijo en el código; ahora es
`HTTP_RATE_LIMIT_PER_MINUTE` (omisión 120, sin cambio). La decisión de rastreador y valor es de S.

### Caída de PostgreSQL (c=4, 60 s; base detenida 20 s a los 15 s)

- La API sobrevive: responde `500 DATABASE_ERROR` mientras la base no está (6 respuestas; el resto
  de los ciclos no llegó a la API porque el propio generador siembra por SQL y también falló: 171
  siembras fallidas) y vuelve sola (`/api/v1/health` 200) sin reiniciar el proceso.
- 794 ciclos; 1 pareja de cobertura con 500 + 500 y 2 del puente con 200 + 500. Los ciclos cortados
  quedan a medias (CxP sin liquidar, factura sin asiento), que es un estado válido y reintentable.
- **Conciliación en 0** después de la caída.

El generador no reintenta: mide lo que el servidor deja escrito cuando el cliente se rinde, que es
el caso más exigente para duplicados; el reintento idempotente de cobertura/cobro/puente ya está
probado en las suites de integración de P-04/P-05/P-06.

### Drenaje del outbox con el worker real

El backlog que dejó la carga (3.983 eventos PENDING) se entregó con `yarn worker:outbox` (lote 25,
sondeo 200 ms) a un receptor local que verifica la firma HMAC (`scripts/ops/outbox-receiver.mjs`):
**17,0 s, 234 eventos/s**, 3.983 aceptados, 3.983 distintos, **0 entregados dos veces**, 0 firmas
inválidas; al final `PUBLISHED=3983`.

## Límite operativo inicial propuesto (a ratificar por S y R)

Hasta 4 trabajadores concurrentes sobre las rutas financieras por réplica: todos los pasos con
p95 < 100 ms sostenido en esta máquina (el más lento, el puente: 88 ms). Con 8, el throughput sube
(23 ciclos/s) y el p95 sigue < 100 ms, pero no se sostuvo 3 minutos: no se afirma.

## Lo que NO se midió (BLOCKED, con dueño)

| Pendiente                                                                  | Motivo                                         | Dueño |
| -------------------------------------------------------------------------- | ---------------------------------------------- | ----- |
| SLO acordado y medición en el entorno objetivo (réplicas, red, proxy real) | Requiere acuerdo de carga y el entorno         | S + R |
| Rastreador y valor del limitador detrás del proxy                          | Decisión de operación                          | S     |
| Alertas entregadas al responsable; soak de horas                           | Sin canal de alertas en local; 3 min no bastan | S     |
| Caída del receptor real de eventos y del exportador de trazas              | No hay receptor desplegado (P-03) ni collector | S + I |
| Locks y espera de conexiones del pool de Sequelize                         | La API no expone métricas del pool             | E     |

Resultados crudos (un JSON por escenario) en `$TMPDIR/atlas-erp-bench/<fecha>/`; no se versionan.
