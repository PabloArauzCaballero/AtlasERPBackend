# Semillas oficiales ATLAS

Paquete `ATLAS_OFFICIAL_BOOTSTRAP_SEEDS` v1.0.0: catálogos, maestros mínimos y reglas
versionadas (1379 filas en 19 tablas). No contiene transacciones ni documentos ficticios.

- `atlas_official_bootstrap_seeds.json` — datos. Su sha256 se verifica contra `99_validation_report.json` en cada importación.
- `06_import_contract.json` — claves naturales de conflicto por tabla.
- `99_validation_report.json` — reporte de validación del emisor (debe estar en `PASS`).

## Aplicación

```bash
npm run db:seed:official:dry-run   # aplica y revierte; útil para revisar el impacto
npm run db:seed:official           # aplica en una sola transacción
```

Requiere las migraciones aplicadas (`npm run db:migrate`). Es idempotente: una segunda corrida
reporta `inserted: 0`.

## Resolución de identidades

El paquete trae UUIDv5 deterministas, pero una base ya existente puede tener la misma fila con
otro id. El importador resuelve cada fila por su clave natural y **reescribe las FK al id real**
antes de insertar; sin eso, las 1122 cuentas contables apuntarían a un `coa_id` inexistente y la
FK fallaría. En una base limpia los UUID del paquete se conservan tal cual.

`atlas_sales.territories` y `public.ad_target_segments` no tienen índice único sobre su clave
natural (`name`), así que su idempotencia depende de esta resolución por SELECT, no de un
`ON CONFLICT`. Un índice único sobre `name` haría la garantía estructural.

## Limpieza pendiente

El paquete marca como candidatas a borrado dos filas de prueba del dump actual
(`chart_of_accounts.code = 'xvzxcvc'` y `tax_code.code = 'cxzzxvcxZCV'`). El importador las
reporta pero **no las borra**: eliminarlas es una decisión manual con respaldo previo.
