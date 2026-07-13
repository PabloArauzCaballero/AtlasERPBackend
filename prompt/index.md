# Instrucciones generales de generación del proyecto

## 0. Modo de trabajo obligatorio: precisión, temperatura 0 y cero adivinanzas

Este proyecto debe trabajarse con un criterio equivalente a **temperatura 0**: máxima precisión, mínima creatividad especulativa y ninguna invención de requisitos, entidades, endpoints, reglas de negocio, nombres de archivos, relaciones, estados, variables de entorno, configuraciones o decisiones técnicas no respaldadas por los documentos entregados.

No debes asumir información crítica. No debes completar vacíos con ideas propias. No debes producir código, diagramas, documentación o estructura si falta información necesaria para hacerlo correctamente.

Si durante el análisis detectas que falta información indispensable, existe una contradicción entre documentos, un diagrama es ambiguo, una regla de negocio no está definida o una decisión técnica afecta producción y no está especificada, debes **detener inmediatamente el procesamiento** y pedir la información faltante antes de continuar.

El resultado debe estar pensado para **producción real**, no como un proyecto académico, demostrativo o de tutorial. Debe poder entregarse a clientes técnicos y exigentes que esperan una solución profesional, mantenible, segura, documentada, auditable y preparada para operación real.

## 1. Lectura obligatoria de prompts base

Antes de generar código, estructura, documentación o cualquier archivo del proyecto, debes leer y aplicar las instrucciones detalladas en los siguientes documentos ubicados en esta misma carpeta:

```txt
./programacionGeneral.md
./programacionBackend.md
```

Primero debes aplicar los lineamientos generales de `programacionGeneral.md` y luego especializar la solución según las reglas de `programacionBackend.md`.

Las instrucciones de ambos documentos son obligatorias y deben cumplirse durante toda la generación del proyecto.

---

## 2. Lectura y análisis de diagramas del sistema

Debes revisar la carpeta `systemInfo` y analizar los diagramas que describen el modelo del sistema.

Los diagramas deben considerarse en el siguiente orden de prioridad:

```txt
1. domainModel.puml
2. caseUseModel.puml
3. classDiagram.puml
4. stateDiagram.puml
5. activityDiagramMainFlow.puml
6. Otros activity diagrams existentes
7. componentDiagram.puml
8. sequenceDiagram.puml
9. deployDiagram.puml
```

### Nota sobre activity diagrams

El archivo `activityDiagramMainFlow.puml` representa el flujo principal del sistema y debe analizarse antes que cualquier otro diagrama de actividad.

Si existen otros diagramas de actividad adicionales, deben analizarse después del flujo principal y deben usarse para complementar reglas de negocio, casos alternativos, validaciones, estados o flujos secundarios.

---

## 3. Criterios de interpretación de los diagramas

Los diagramas deben usarse como fuente principal para identificar:

- Entidades principales del dominio.
- Relaciones entre entidades.
- Casos de uso del sistema.
- Actores involucrados.
- Estados relevantes.
- Flujos principales y alternativos.
- Componentes internos.
- Comunicación entre módulos.
- Secuencia de operaciones.
- Reglas de negocio implícitas.
- Límites del sistema.
- Dependencias externas.
- Requerimientos de despliegue.

No debes inventar entidades, relaciones, endpoints o módulos que contradigan los diagramas.

Si existe información incompleta, debes tomar decisiones razonables, documentar los supuestos y mantener consistencia con el modelo general.

---

## 4. Manejo de diagramas faltantes o incompletos

Si uno o más diagramas no existen, están incompletos o presentan ambigüedades, no debes detener la generación del proyecto.

En ese caso debes:

1. Continuar usando los diagramas disponibles.
2. Documentar claramente qué diagramas faltan.
3. Indicar qué decisiones se asumieron.
4. Evitar inventar reglas críticas sin justificación.
5. Reflejar los supuestos en la documentación del proyecto.

Los supuestos deben registrarse en:

```txt
docs/
  architecture/
    architecture.md
    flows.md
```

Cuando corresponda, también deben mencionarse en:

```txt
docs/
  endpoints/
    endpoints.md
```

---

## 5. Relación entre diagramas y arquitectura generada

La estructura del backend debe derivarse del análisis de los diagramas.

Como regla general:

- El `domainModel.puml` ayuda a identificar entidades, modelos y relaciones.
- El `caseUseModel.puml` ayuda a identificar módulos, endpoints y permisos.
- El `classDiagram.puml` ayuda a identificar clases, atributos, métodos y responsabilidades.
- El `stateDiagram.puml` ayuda a identificar estados válidos y transiciones.
- Los activity diagrams ayudan a identificar flujos de negocio y validaciones.
- El `componentDiagram.puml` ayuda a definir módulos, capas y dependencias internas.
- El `sequenceDiagram.puml` ayuda a definir el orden de interacción entre capas.
- El `deployDiagram.puml` ayuda a definir configuración, variables de entorno, despliegue y dependencias externas.

---

## 6. Generación de entregables

Debes generar todos los archivos requeridos por el prompt principal y por los prompts complementarios.

La solución debe incluir, según corresponda:

- Código fuente en TypeScript.
- Backend Node.js con Express.
- Sequelize como ORM.
- Modelos, migraciones y seeders.
- Repositorios.
- Services.
- Controllers.
- Routes.
- Schemas de validación con Zod.
- Middlewares de autenticación, autorización, validación y errores.
- Manejo seguro de JWT.
- Documentación por carpeta mediante `README.md`.
- Documentación de endpoints.
- Documentación de arquitectura.
- Documentación de flujos.
- Colección Postman, si corresponde.
- OpenAPI, si corresponde.
- Smoke tests, si corresponde.
- Pruebas sugeridas o implementadas, según el alcance solicitado.

---

## 7. Estructura esperada de documentación

La documentación del sistema generado debe ubicarse preferentemente en:

```txt
docs/
  endpoints/
    endpoints.md
    openapi.yaml
    README.md

  architecture/
    architecture.md
    flows.md
    README.md

  postman/
    collection.json
    README.md
```

Los prompts usados para generar el proyecto deben ubicarse en:

```txt
prompt/
  index.md
  programacionGeneral.md
  programacionBackend.md
  README.md
```

La carpeta `prompt` no reemplaza a `docs`.

- `prompt/` contiene reglas e instrucciones de generación.
- `docs/` contiene documentación técnica del sistema generado.

---

## 8. Entrega final en archivo ZIP

Debes devolver el resultado final comprimido en un archivo `.zip`.

El `.zip` debe incluir:

- Todo el código fuente generado.
- Toda la estructura de carpetas solicitada.
- Todos los `README.md` requeridos.
- Toda la documentación técnica.
- La carpeta `docs`.
- La carpeta `prompt`.
- Archivos de configuración necesarios.
- Archivos de pruebas, si corresponde.
- Colección Postman, si corresponde.
- Archivo OpenAPI, si corresponde.
- Cualquier recurso adicional indicado en el prompt principal.

El `.zip` debe estar organizado de forma limpia y lista para ser revisada, ejecutada o integrada en un proyecto real.

No entregues archivos sueltos si el prompt principal exige una estructura completa de proyecto.

---

## 9. Validación final antes de entregar

Antes de entregar el `.zip`, verifica que:

- Se aplicaron las reglas de `programacionGeneral.md`.
- Se aplicaron las reglas de `programacionBackend.md`.
- Se revisaron los diagramas disponibles en `systemInfo`.
- La arquitectura respeta los diagramas.
- El código fuente está en TypeScript.
- No hay mezcla innecesaria de CommonJS y ES Modules.
- Sequelize se usa como ORM principal.
- Las validaciones usan Zod.
- JWT está correctamente encapsulado.
- No existe ningún controller genérico.
- El `createCrudRepository` se usa cuando aporta valor.
- El `createCrudService` solo se usa si el caso es simple y controlado.
- Cada carpeta importante tiene su `README.md`.
- Los endpoints están documentados.
- Los flujos relevantes están documentados.
- La estructura final es coherente, mantenible y lista para producción.
- Revisar **DOS** veces que todo lo que se solicito en este prompt este efectivamente realizado.

## 10. Workers como procesos persistentes de producción

Todos los workers del sistema deben diseñarse como **procesos persistentes de larga duración**, no como funciones temporales que se ejecutan, procesan una tarea y mueren.

Un worker debe comportarse como un proceso independiente del servidor HTTP principal, ejecutándose de forma continua mientras el sistema esté operativo.

El objetivo es que el worker permanezca escuchando, consumiendo y procesando trabajos de la cola de forma controlada, segura y observable.

### Reglas obligatorias

1. Los workers deben ejecutarse como procesos separados del API HTTP.
2. Los workers no deben depender de que un endpoint sea llamado para activarse.
3. Los workers no deben iniciarse y finalizar por cada tarea individual.
4. Los workers deben permanecer activos escuchando la cola correspondiente.
5. Los workers deben poder procesar múltiples jobs durante su ciclo de vida.
6. Los workers deben manejar errores sin detener todo el proceso.
7. Los workers deben registrar logs útiles de inicio, procesamiento, errores y apagado.
8. Los workers deben implementar apagado controlado.
9. Los workers deben respetar límites de concurrencia.
10. Los workers deben usar reintentos controlados cuando corresponda.
11. Los workers deben evitar procesar dos veces el mismo job mediante idempotencia.
12. Los workers deben integrarse con la cola definida, por ejemplo `pg-boss`, sin crear mecanismos paralelos improvisados.
13. Los workers deben tener configuración propia mediante variables de entorno.
14. Los workers deben documentarse en `docs/architecture/flows.md` y en el `README.md` de su carpeta correspondiente.

### Estructura esperada

Cuando el sistema requiera workers, deben ubicarse en una carpeta especializada.

Estructura sugerida:

```txt
src/
  workers/
    email-sender/
      email-sender.worker.ts
      email-sender.processor.ts
      email-sender.types.ts
      README.md

    webhook-processor/
      webhook-processor.worker.ts
      webhook-processor.processor.ts
      webhook-processor.types.ts
      README.md

    index.ts
```

Cada worker debe tener responsabilidades claras:

- El archivo `.worker.ts` inicia el proceso persistente.
- El archivo `.processor.ts` contiene la lógica de procesamiento de cada job.
- El archivo `.types.ts` define contratos de datos.
- El `README.md` explica qué hace el worker, qué cola consume, qué eventos procesa, qué errores maneja y cómo se ejecuta.

### Separación entre API y workers

El servidor HTTP y los workers deben poder ejecutarse de forma independiente.

Ejemplo conceptual:

```json
{
  "scripts": {
    "dev:api": "tsx watch src/server.ts",
    "dev:worker:email": "tsx watch src/workers/email-sender/email-sender.worker.ts",
    "start:api": "node dist/server.js",
    "start:worker:email": "node dist/workers/email-sender/email-sender.worker.js"
  }
}
```

No es correcto que el worker dependa de `server.ts` para funcionar, salvo que el proyecto defina explícitamente una estrategia monolítica y esta haya sido justificada.

### Manejo de ciclo de vida

Todo worker debe implementar ciclo de vida controlado:

```txt
Inicio del worker
→ conexión a base de datos
→ conexión a cola
→ suscripción a jobs
→ procesamiento continuo
→ manejo de errores
→ apagado controlado
```

Debe manejar señales del sistema como:

```txt
SIGTERM
SIGINT
```

Durante el apagado controlado debe:

1. Dejar de aceptar nuevos jobs.
2. Terminar jobs en curso cuando sea seguro.
3. Cerrar conexión con la cola.
4. Cerrar conexión con base de datos.
5. Registrar el cierre en logs.

### Supervisión en producción

Los workers deben estar pensados para ejecutarse bajo un supervisor de procesos o plataforma de despliegue, por ejemplo:

```txt
PM2
Docker Compose
Kubernetes
systemd
Railway
Render
Fly.io
ECS
```

El código debe permitir que el worker sea reiniciado automáticamente si el proceso falla.

No se debe diseñar un worker como una función manual que el desarrollador ejecuta ocasionalmente.

### Variables de entorno sugeridas

Cuando existan workers, deben considerarse variables como:

```txt
WORKER_EMAIL_ENABLED=true
WORKER_EMAIL_CONCURRENCY=5
WORKER_EMAIL_QUEUE_NAME=email-send
WORKER_EMAIL_MAX_RETRIES=3
WORKER_EMAIL_RETRY_DELAY_SECONDS=60
WORKER_SHUTDOWN_TIMEOUT_SECONDS=30
```

Estas variables deben validarse con Zod junto con el resto de variables de entorno.

### Criterio final

Los workers deben diseñarse como componentes de producción, no como scripts auxiliares.

Un worker correcto debe ser:

- Persistente.
- Independiente del API.
- Observable.
- Reiniciable.
- Configurable.
- Seguro ante errores.
- Compatible con reintentos.
- Idempotente.
- Documentado.
- Preparado para despliegue real.
