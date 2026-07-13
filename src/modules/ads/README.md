# Módulo Ads

## Responsabilidad

Gestiona publicidad externa B2B dentro de ATLAS: anunciantes externos, campañas, moderación, inventario, políticas, delivery, eventos, ledger, facturación y auditoría.

## Archivos

- `ads.module.ts`: registra controllers, services, repositories y modelos Sequelize.
- `controllers/admin-ads.controller.ts`: endpoints del portal administrativo interno `/admin/ads/*`.
- `controllers/ads-delivery.controller.ts`: endpoints internos del ad server y motor de eventos `/ads/*`.
- `services/`: reglas de negocio y transacciones.
- `repositories/`: acceso a datos con Sequelize.
- `models/`: modelos relacionales del esquema Ads.
- `ads.schemas.ts`: validaciones Zod por body, params y query.
- `ads.dtos.ts`: tipos inferidos desde Zod.
- `ads.mappers.ts`: salida segura y normalización de modelos.

## Flujo general

1. Request entra por controller.
2. JWT/RBAC valida identidad y rol.
3. Zod valida params/query/body.
4. Service ejecuta reglas de negocio.
5. Repository consulta/modifica PostgreSQL.
6. Mutaciones sensibles registran `ad_audit_log`.
7. Interceptor global agrega `requestId`.

## Qué no debe ir aquí

- Lógica de autenticación global.
- Configuración de CORS/base de datos.
- Integraciones fiscales/SIN reales hasta definir proveedor.
