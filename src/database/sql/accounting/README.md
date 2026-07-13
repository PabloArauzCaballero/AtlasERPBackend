# SQL del módulo contable ATLAS

Esta carpeta contiene el SQL canónico del módulo.

## Archivos

- `001_schema_atlas_accounting.sql`: crea el esquema base `atlas_accounting`, tablas, relaciones e índices iniciales.
- `002_hardening_atlas_accounting.sql`: agrega restricciones SAP-like de despliegue: estados controlados, consistencia ledger/período/entidad legal, dimensiones obligatorias, balance diferido de asientos e inmutabilidad contable.

## Orden de ejecución

```bash
yarn db:schema
```

El script ejecuta ambos archivos en orden. Para datos de referencia:

```bash
yarn db:seed
```

## Reglas importantes

- No uses `sequelize.sync({ force: true })` ni `sequelize.sync({ alter: true })` en producción.
- Los asientos publicados no se editan: se reversan.
- Las líneas del journal se balancean también en base de datos mediante trigger diferido.
- El cierre se bloquea si existen documentos en borrador, conciliaciones abiertas o líneas bancarias sin matching aprobado.
