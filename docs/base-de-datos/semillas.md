# Semillas del ERP

## Dónde viven los datos de semilla

**Fuera del repositorio.** El conjunto sembrado —plan de cuentas, impuestos, territorios, productos
facturables, placements y políticas de publicidad, política de calificación ASFI, y los comercios y
usuarios de prueba— se publica en una **base separada** (`seed_atlas_erp`) del mismo PostgreSQL
propio (`atlas-postgres`) y se trae con un comando:

```bash
npm run db:migrate     # el esquema lo siguen definiendo las migraciones versionadas
npm run db:seed:pull   # los datos los trae la base de semillas
```

Antes eran `src/database/seeders/`, de los cuales 1,5 MB era un solo archivo:
`official/atlas_official_bootstrap_seeds.json`, el paquete de semillas oficiales con las 1 122
cuentas del plan contable. Un JSON de ese tamaño en el árbol de fuentes no se revisa en un PR, no se
diferencia de forma legible y se clona en cada `git clone` desde entonces hasta siempre.

## La base es el perfil

No hay lista de archivos por entorno. `REFERENCE_SEEDS`/`DEVELOPMENT_SEEDS` en
`database-seeder.service.ts` decidían con `NODE_ENV` qué `.sql` entraba; ahora lo decide **a qué
base se apunta**, y a la base de producción no se le puede pedir lo que no tiene. Como todas las
bases de semillas viven en el mismo host (`atlas-postgres`), cambiar de perfil es cambiar
`SEED_SOURCE_DB`, no el host.

Esa lista, además, era un sitio donde las cosas se caían: la política de calificación ASFI llevaba
desde agosto en disco sin estar en ella ni tener guion de npm, así que `rating_policy_versions` y
`rating_policy_bands` estaban vacías en toda base creada desde entonces y el calificador devolvía
`RATING_POLICY_NOT_ACTIVE`. Un conjunto publicado no tiene lista que actualizar: lo que está en la
base de semillas, llega.

## Configuración

Dos formas, en este orden de precedencia (ver `src/database/seed-source.ts`):

1. `SEED_SOURCE_DATABASE_URL` — cadena completa. Gana sobre todo lo demás.
2. `SEED_SOURCE_HOST` + `SEED_SOURCE_DB` + `SEED_SOURCE_USER` + `SEED_SOURCE_PASSWORD` — la vía
   cómoda cuando **sólo cambia la base**.

## Comandos

| Comando                  | Qué hace                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| `npm run db:seed:pull`   | Trae el conjunto publicado. **Destructivo** sobre las tablas del manifiesto. |
| `npm run db:seed:status` | Compara lo publicado con lo que hay aquí. No escribe nada.                   |
| `npm run db:seed:demo`   | Sin cambios: genera operación transaccional de demostración (no es semilla). |

## Cómo carga

Dentro de **una transacción**: retira las claves foráneas, vacía las tablas del manifiesto, copia y
vuelve a crear las restricciones. Recrearlas es lo que **valida** el resultado —una fila huérfana
aborta el `ALTER` y revierte la carga completa—, y es además la única forma de cargar un grafo con
ciclos, donde ningún orden topológico existe. Los valores viajan como texto (`col::text` al leer,
`$n::tipo` al escribir) para no depender de cómo el driver traduzca cada tipo a JavaScript.

## Qué se reemplaza exactamente, y qué no

El manifiesto son **las tablas que el conjunto publicado trae con filas**, y un pull las vacía antes
de cargarlas. Todo lo demás —lo que sólo escribe el runtime: bitácoras, entregas de notificación,
tokens, ejecuciones de trabajos— se queda intacto.

Ese límite hay que mirarlo una vez, porque no siempre cae donde uno espera. Una tabla en la que la
semilla pone tres filas y el runtime escribe cientos de miles **está en el manifiesto**, así que el
pull se lleva las del runtime con ella. En este proyecto ocurre con `audit.operational_audit_logs`
y con las de `telemetry.*`. Consultar el manifiesto vigente antes de traer semillas sobre una base
con historia:

```sql
SELECT table_schema, table_name, row_count FROM atlas_seed.manifest ORDER BY 1, 2;
```

Por eso el pull NO se dispara solo. El job de arranque lleva `--if-empty` y no toca una base que ya
tenga datos; el pull sin bandera es un acto deliberado de una persona que quiere justamente ese
reemplazo.

**Nota de implementación**: el vaciado es `TRUNCATE` sin `CASCADE`, y no es un detalle. Con `CASCADE`
la orden alcanza a cualquier tabla que apunte al catálogo y la vacía también — traer 8 840 filas de
catálogo se llevaba por delante 390 000 de bitácora—. Para poder truncar sin él, la carga retira
también las claves foráneas que ENTRAN al manifiesto, y al recrearlas comprueba que las filas de
runtime siguen apuntando a algo que existe.

## Al arrancar

`STARTUP_SEEDS_ENABLED=true` trae las semillas al arrancar **sólo si la base está vacía**. Antes la
salvaguarda la daba gratis el mecanismo —cada `.sql` era un upsert idempotente—; ahora que la carga
es un reemplazo, es explícita, o reiniciar el proceso borraría el trabajo de la sesión anterior.
