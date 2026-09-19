# Fase 22 — Coste de la instrumentación

**Estado: SIN MEDICIÓN PROPIA BAJO CARGA.** Hay una medición real de la misma capa en
AtlasBackend, al final de este documento, que sirve de cota superior.

**Lo pendiente aquí:** No se afirma que la sobrecarga sea aceptable: eso
exige medirlo con tráfico representativo, y este repositorio no tiene arnés de carga.

## Lo que sí está medido

| Medición                          | Resultado                                                                                 | Cómo                          |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| Arranque con telemetría apagada   | No construye exportador ni instrumentaciones                                              | `telemetry.config.spec.ts`    |
| Arranque con telemetría encendida | Cuatro instrumentaciones activas, traza real exportada                                    | E2E contra Jaeger, 2026-09-18 |
| Cierre                            | `stopTracing()` resuelve y no lanza aunque el vaciado falle                               | `jaeger:verify`               |
| Suite completa                    | **1133 pruebas en verde, 60 suites**, ~7 s                                                | `yarn test`                   |
| Spans por petición HTTP real      | **6** en `GET /api/v1/accounting/business-partners`                                       | Traza en Jaeger               |
| Sondas                            | `/api/v1/health` y `/api/v1/ready` **no generan traza** ni cabecera                       | ídem                          |
| Correlación log↔traza             | La línea de Pino lleva el mismo `trace_id` que la cabecera, más `span_id` y `trace_flags` | ídem                          |
| Fuga de datos                     | El término de búsqueda incrustado en un `ILIKE` **no** aparece en la traza                | ídem                          |
| Migración                         | Aplicada contra PostgreSQL 16 real y **verificada idempotente** (tres pasadas)            | `psql`                        |

### Desglose de una petición real

`GET /api/v1/accounting/business-partners?limit=1&search=…`, base vacía, muestreo al 100 %:

```
GET /api/v1/accounting/business-partners     5,5 ms
  request handler - …/business-partners      4,8 ms
    pg.query:SELECT (count)                  2,6 ms
    pg.query:SELECT (página)                 2,6 ms
```

Seis spans, todos con significado. **No hay spans de middleware**: se apagaron a propósito.

Esto **no** es una medición de sobrecarga: es una petición en frío contra una base sin datos.
Sirve para afirmar que la jerarquía es correcta y legible, no para cuantificar el coste.

## Lo que falta medir, y cómo

Sin arnés de carga en el repositorio, la vía realista es `autocannon` o `k6` contra un endpoint
de lectura, con la misma carga en cinco configuraciones:

| #   | `OTEL_ENABLED` | Muestreo | Destino                          |
| --- | -------------- | -------- | -------------------------------- |
| 1   | `false`        | —        | —                                |
| 2   | `true`         | 1.0      | Jaeger local                     |
| 3   | `true`         | 0.10     | Jaeger local                     |
| 4   | `true`         | 1.0      | **sin destino** (puerto cerrado) |
| 5   | `true`         | 1.0      | Collector                        |

Métricas: latencia media, p50, p95, p99; CPU y memoria; throughput; errores; tiempo de arranque
y de cierre; spans perdidos.

La configuración 4 es la importante: verifica que un destino inalcanzable no añade latencia al
camino de la petición, que es la propiedad de la que depende todo lo demás.

## Criterios de aceptación cuando se ejecute

| Criterio                                                   | Umbral                     |
| ---------------------------------------------------------- | -------------------------- |
| p95 con muestreo de producción frente a telemetría apagada | ≤ +5 %                     |
| p99                                                        | ≤ +10 %                    |
| Latencia con destino caído frente a destino disponible     | Sin diferencia estadística |
| Memoria adicional en régimen                               | ≤ 50 MB por proceso        |
| Tiempo de arranque adicional                               | ≤ 500 ms                   |

Si alguno no se cumple, la palanca es el **ratio de muestreo**, no retirar instrumentaciones: el
coste crece con el número de spans exportados, no con el de parches instalados.

## Referencia medida en AtlasBackend (2026-09-19)

Este repositorio sigue **sin arnés de carga propio**, así que lo que viene abajo no es una
medición suya. Pero la capa de trazas es la misma, y en AtlasBackend sí se midió con carga real
—16 corridas válidas, 4 configuraciones, 4 rondas intercaladas, 10 req/s durante 120 s— contra
un Jaeger real. Sirve como **cota superior razonable**, porque aquel backend monta CINCO
instrumentaciones y este cuatro (no usa `ioredis`):

| Configuración              | CPU del proceso | Δ       | p95        |
| -------------------------- | --------------- | ------- | ---------- |
| apagada                    | 20,46 s         | —       | 28,27 ms   |
| muestreo 0.10 (producción) | 22,89 s         | +11,8 % | +3,3 %     |
| destino cerrado            | 23,62 s         | +15,4 % | **+1,4 %** |
| muestreo 1.0 (depuración)  | 25,46 s         | +24,4 % | +12,1 %    |

Las dos conclusiones que se trasladan tal cual:

1. **Un destino caído no cuesta latencia.** +1,4 % en p95 frente a una dispersión de la línea
   base del 14 %, con el signo repartido entre rondas. La exportación está fuera del camino de
   la petición, que es la propiedad de la que depende todo lo demás.
2. **Bajar el muestreo NO recorta el coste en proporción.** De 1.0 a 0.10 la sobrecarga pasa de
   +24,4 % a +11,8 %, no a +2,4 %: el 43 % del coste es fijo —parcheo y propagación de
   contexto— y se paga en toda petición, se muestree o no. Si hiciera falta bajar más, la
   palanca que queda es retirar instrumentaciones, no seguir bajando el ratio.

Lo que **no** se puede trasladar: los valores absolutos de latencia, que dependen de las
consultas de cada backend y del volumen de su base.
