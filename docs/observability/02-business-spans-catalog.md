# Fase 8 — Catálogo de spans de negocio

Los spans que el ERP abre a mano, por qué existen y qué NO llevan.

## Criterio de admisión

Un span de negocio entra sólo si cumple las dos condiciones:

1. **No es coextensivo con una petición HTTP.** Si la operación es 1:1 con su endpoint, el span
   del servidor ya la delimita y uno propio sería un duplicado sin información.
2. **Responde una pregunta que la instrumentación automática no responde.**

Ese criterio dejó fuera, por ejemplo, un span para cada endpoint de listado: `pg` ya dice
cuánto tardó la consulta y el span del servidor cuánto la petición entera.

## Spans

### `accounting.document.draft`

|           |                                                                                       |
| --------- | ------------------------------------------------------------------------------------- |
| Archivo   | `src/modules/accounting/documents/services/accounting-documents.service.ts`           |
| Tipo      | INTERNAL                                                                              |
| Atributos | `app.module=accounting`, `app.operation=draft`, `app.entity.type=accounting_document` |

**Motivo de negocio.** Pese a existir un endpoint que lo llama, **no** es redundante:
`createDraftBulk` lo invoca en bucle. En un lote de cincuenta documentos es la única forma de
ver cuál tardó o cuál falló; sin él, el lote es un bloque opaco de varios segundos.

**Privacidad.** Ni importes, ni razón social, ni NIT, ni número de documento.

### `accounting.document.post`

|           |                                                                        |
| --------- | ---------------------------------------------------------------------- |
| Archivo   | el mismo                                                               |
| Tipo      | INTERNAL                                                               |
| Atributos | `app.module`, `app.operation=post`, `app.entity.type`, `app.entity.id` |

**Motivo de negocio.** Contabilizar toma un bloqueo de fila (`lock: UPDATE`) para que dos
publicaciones simultáneas del mismo documento no generen el asiento dos veces. Ese bloqueo es
justo lo que se manifiesta como «la pantalla se quedó pensando», y el span es lo que permite
verlo. Se invoca además desde el reverso, que no es su propio endpoint.

**`app.entity.id` sí se publica**: es el identificador del documento y es exactamente lo que
soporte usa para encontrar la traza de un caso. Es opaco y no identifica a una persona.

### `outbox.publish`

|           |                                                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archivo   | el mismo (`publicarEnOutbox`)                                                                                                                                                                                   |
| Tipo      | **PRODUCER**                                                                                                                                                                                                    |
| Atributos | `messaging.system=atlas-erp-outbox`, `messaging.destination.name=atlas_accounting.event_outbox`, `messaging.operation.type=send`, `app.event.type`, `app.entity.type`, `app.entity.id`, `app.module=accounting` |

**Motivo de negocio.** Marca el punto en el que el trabajo deja de ser síncrono. El portador de
traza se inyecta **dentro** de este span, así que el span consumidor del worker cuelga de aquí.

**Decisión de diseño.** Las tres publicaciones del servicio —borrador creado, documento
contabilizado, documento reversado— pasaban por tres `create` idénticos. Ahora comparten un solo
método privado: un tercer sitio que se olvidara de inyectar el portador rompería la traza sin
que nada fallara.

### `outbox.dispatch`

|           |                                                                     |
| --------- | ------------------------------------------------------------------- |
| Archivo   | `src/workers/outbox/outbox.worker.ts`                               |
| Tipo      | **CONSUMER**                                                        |
| Atributos | `messaging.*`, `app.event.type`, `app.entity.type`, `app.entity.id` |

**Motivo de negocio.** Es el único punto del ERP donde la traza cruza de un proceso a otro. El
contexto murió con el commit de la API y aquí se reconstruye desde `trace_context`.

**Compatibilidad.** Una fila anterior a la migración trae `NULL` y el consumidor abre una traza
raíz: se procesa igual. No hay rama especial para ello; es la consecuencia natural de que
`extract` devuelva el contexto activo.

### `job.run`

|           |                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Archivos  | `ads/services/email-messaging.processor.ts`, `b2b-sales-crm/services/b2b-overdue-sweep.processor.ts` |
| Tipo      | INTERNAL, **traza raíz** (`root: true`)                                                              |
| Atributos | `app.module`, `app.operation=run`, `app.job.name`, `app.job.outcome`                                 |

**Motivo de negocio.** Los dos procesadores corren **dentro del proceso del API**, con
`setInterval`. Sin traza raíz, su trabajo y sus consultas aparecerían como spans sueltos sin
nada que los explique — o, peor, colgando de la petición HTTP que casualmente estuviera en curso.

**`app.job.outcome`** distingue tres desenlaces: `completed`, `failed` y `skipped_overlap`. El
tercero importa: una tanda que se salta por solapamiento es una respuesta, no un silencio, y si
se repite significa que el intervalo es más corto que la duración real del trabajo.

## Riesgos de privacidad revisados

| Atributo          | Riesgo evaluado                     | Veredicto                                                    |
| ----------------- | ----------------------------------- | ------------------------------------------------------------ |
| `app.entity.id`   | Identificador de documento contable | Admitido: opaco, y sin él la traza no se ata a su caso       |
| `app.event.type`  | Tipo del hecho publicado            | Admitido: catálogo cerrado (`accounting.document.posted`, …) |
| `app.job.name`    | —                                   | Admitido: dos valores                                        |
| `app.job.outcome` | —                                   | Admitido: tres valores                                       |

**Nada de lo que se publica lleva importes, razón social, NIT, número de documento ni correos
de destinatarios de campaña.**
