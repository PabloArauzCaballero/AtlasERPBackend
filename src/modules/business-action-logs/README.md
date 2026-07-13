# Módulo Business Action Logs

## Responsabilidad

Registra acciones de negocio auditables, separadas de los logs técnicos de Pino y de los logs HTTP. Este módulo sirve para responder qué proceso de negocio impactó qué tablas, quién lo ejecutó, cuántos registros afectó y bajo qué correlación/batch.

## Archivos

- `business-action-logs.module.ts`: registra el modelo Sequelize, controller y service del módulo.
- `business-action-logs.controller.ts`: expone la consulta administrativa de acciones de negocio.
- `business-action-logs.service.ts`: escribe y consulta logs de acción de negocio.
- `business-action-logs.schemas.ts`: valida filtros de consulta con Zod.
- `business-action-logs.types.ts`: define el contrato interno de escritura.

## Qué no debe ir aquí

No debe reemplazar los logs técnicos, trazas HTTP, auditorías fiscales específicas ni auditorías propias de Ads/CRM. Es una bitácora transversal de negocio para acciones multi-tabla, batches y flujos críticos.
