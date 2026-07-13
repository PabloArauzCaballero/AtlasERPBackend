# Controllers del módulo Ads

Contiene los controllers HTTP del módulo de publicidad externa.

## Responsabilidad

- Recibir requests HTTP del panel administrativo y del ad server.
- Aplicar validación Zod mediante `ZodValidationPipe` en body, params y query.
- Aplicar autorización declarativa con `@Roles`.
- Delegar reglas de negocio a services del módulo.

## Archivos

### admin-ads.controller.ts

Expone endpoints administrativos para anunciantes, campañas, inventario, moderación, facturación, auditoría y monitoreo.

### ads-delivery.controller.ts

Expone endpoints operativos para selección de anuncios y registro de eventos.

## Qué no debe ir aquí

- Consultas directas a Sequelize.
- Reglas de negocio complejas.
- Validaciones manuales que puedan expresarse como schemas Zod.
