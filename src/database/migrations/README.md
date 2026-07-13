# Migraciones

Contiene scripts SQL versionados para crear o modificar la estructura de base de datos.

## Convenciones

- No usar `sequelize.sync({ force: true })` ni `sequelize.sync({ alter: true })` en producción.
- Cada cambio estructural debe quedar en una migración revisable.
- Las migraciones deben ejecutarse con `npm run db:migrate` o el mecanismo aprobado por despliegue.

## 20260709010000-create-business-action-logs.sql

Crea el esquema `atlas_audit` y la tabla `business_action_logs`, usada para auditoría transversal de acciones de negocio y batches. Esta tabla es distinta de los logs técnicos Pino y de las auditorías específicas por dominio.
