# Módulo B2B Sales CRM

## Responsabilidad

Implementa el CRM/Ventas B2B de ATLAS: cuentas, oportunidades, propuestas, contratos, onboarding, compras BNPL originadas por comercio, facturación comercial, cobertura ATLAS→comercio, recuperación consumidor y conciliación.

## Archivos

- `b2b-sales-crm.module.ts`: registra controllers, service, repository y modelos Sequelize.
- `b2b-sales-crm.enums.ts`: catálogos controlados del módulo.
- `b2b-sales-crm.schemas.ts`: validaciones Zod para body, params y query.
- `b2b-sales-crm.dtos.ts`: tipos inferidos desde Zod.
- `b2b-sales-crm.mapper.ts`: transforma modelos internos en respuestas seguras.
- `domain/`: reglas puras del módulo, sin Nest ni Sequelize (calificación de riesgo y el
  vocabulario de segmentación comercial: qué puede mirar un segmento de cada sujeto).
- `models/`: modelos Sequelize.
- `repositories/`: acceso a datos mediante Sequelize.
- `services/`: reglas de negocio y transacciones.
- `controllers/`: endpoints HTTP protegidos por JWT y roles.

## Flujo general

1. La request entra por un controller.
2. `JwtAuthGuard` valida token Bearer.
3. `RolesGuard` valida permisos.
4. `ZodValidationPipe` valida entrada externa.
5. El service ejecuta reglas de negocio.
6. El repository consulta o modifica PostgreSQL con Sequelize.
7. El mapper devuelve DTO seguro.

## Qué no debe ir aquí

- Autenticación completa de usuarios.
- Lógica del core BNPL de scoring de consumidor.
- Integración fiscal SIN/ERP real.
- Workers externos de cobranza.

Esas piezas deben integrarse como módulos externos o bounded contexts separados.
