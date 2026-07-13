# Patch: seeds para todas las tablas

## Implementado

- Descubrimiento automático de tablas en `public`, `atlas_sales`, `atlas_accounting` y `atlas_audit`.
- Exclusión de tablas técnicas de migración.
- Inserción únicamente en tablas vacías.
- Resolución de claves foráneas y reintentos por dependencia.
- Valores válidos por tipo, enums, CHECK constraints y nombres semánticos.
- Transacción única con rollback ante cobertura incompleta.
- Protección estricta contra ejecución en producción.
- Pruebas unitarias del resolvedor de valores.

## Comandos validados

- `npm run type-check`: OK.
- ESLint completo: OK.
- Pruebas del seed: 4/4 OK.
- `npm run build`: OK.

## Nota

La ejecución real de `db:seed` requiere una instancia PostgreSQL migrada y una variable `DATABASE_URL` válida.
