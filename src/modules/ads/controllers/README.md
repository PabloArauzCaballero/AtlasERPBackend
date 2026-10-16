# Controllers del módulo Ads

Contiene los controllers HTTP del módulo de publicidad externa.

## Responsabilidad

- Recibir requests HTTP del panel administrativo y del ad server.
- Aplicar validación Zod mediante `ZodValidationPipe` en body, params y query.
- Aplicar autorización declarativa con `@Roles`.
- Delegar reglas de negocio a services del módulo.

## Archivos

### admin-ads-*.controller.ts

La consola administrativa `/admin/ads/*` se reparte por agregado, todos con el mismo prefijo:
`admin-ads-advertisers` (anunciantes y perfiles de facturación), `admin-ads-campaigns` (campañas y envío a moderación),
`admin-ads-moderation` (cola y decisiones), `admin-ads-inventory`, `admin-ads-policies`, `admin-ads-billing`
(cierre de periodo y pagos), `admin-ads-delivery` (monitor y estado facturable de eventos),
`admin-ads-email` (envío, rastreo y supresiones) y `admin-ads-oversight` (tablero y auditoría).

### ads-delivery.controller.ts

Expone endpoints operativos para selección de anuncios y registro de eventos.

## Qué no debe ir aquí

- Consultas directas a Sequelize.
- Reglas de negocio complejas.
- Validaciones manuales que puedan expresarse como schemas Zod.
