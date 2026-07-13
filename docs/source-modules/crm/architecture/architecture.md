# Arquitectura — ATLAS CRM/Ventas B2B

## Stack

- NestJS como framework backend.
- TypeScript estricto.
- Sequelize + sequelize-typescript como ORM.
- PostgreSQL como base de datos.
- Zod para validación.
- JWT Bearer para autenticación.
- Guards de autenticación y autorización.
- Exception filter global para errores HTTP y Sequelize.
- Response interceptor global para respuestas consistentes.

## Separación de responsabilidades

```txt
src/
  config/                  Configuración y env validado
  database/                Registro Sequelize, migraciones y seeders
  common/                  Guards, pipes, filters, interceptors y tipos compartidos
  modules/
    b2b-sales-crm/         Dominio CRM/Ventas B2B
    health/                Diagnóstico
```

## Bounded contexts implementados

1. `SalesCRM`: cuentas, contactos, oportunidades, propuestas y aprobaciones.
2. `CommercialContracting`: contratos, versiones y términos comerciales.
3. `MerchantOnboarding`: sucursales, usuarios del comercio y checklist.
4. `B2BBilling`: facturas, CxC comercial y pagos.
5. `BNPLCoreLink`: compra BNPL, cuotas, CxP ATLAS→comercio y recuperación consumidor.
6. `ReconciliationAudit`: conciliación y auditoría.

## Persistencia

La migración crea schema `atlas_sales`, enums, tablas, constraints e índices. `synchronize` está deshabilitado para evitar cambios destructivos.

## Autenticación y autorización

El módulo usa JWT Bearer. El payload mínimo esperado es:

```json
{ "sub": "uuid", "roleCode": "ADMIN" }
```

Los controllers declaran roles con `@Roles(...)`. El `RolesGuard` devuelve 403 si el usuario está autenticado pero no tiene permiso.

## Validación

Cada body, params y query de endpoints críticos se valida con `ZodValidationPipe`. Los DTOs se infieren desde schemas Zod, evitando duplicar contratos.

## Errores

`HttpExceptionFilter` normaliza errores:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": []
  }
}
```

También traduce errores comunes de Sequelize a 400/409/500 controlados.

## Supuestos documentados

- El módulo se entrega como backend integrable/standalone porque no se recibió un repositorio ATLAS base donde insertar código.
- La integración fiscal SIN/ERP se modela con `external_tax_ref`; no se implementa conector externo real.
- El scoring consumidor pertenece al Core BNPL; aquí solo se conserva referencia `consumers_ref`.
- El mínimo MDR se configura por `DEFAULT_MIN_MDR_RATE_PERCENT`.

## Observabilidad y logging Pino

El módulo usa Pino como logger estructurado JSON. La configuración está centralizada en `src/common/logging` y se aplica en todas las capas críticas del código:

- `main.ts`: inicio del proceso HTTP, puerto y prefijo global.
- `LoggingInterceptor`: traza de cada request, `X-Request-Id`, duración, status, método, path y usuario autenticado cuando existe.
- `JwtAuthGuard` y `RolesGuard`: aceptación/rechazo de autenticación y autorización sin registrar tokens.
- `ZodValidationPipe`: rechazo de validaciones con cantidad de errores y campos afectados, sin bodies completos.
- `HttpExceptionFilter`: errores 5xx e infraestructura normalizados.
- `HealthService`: health/readiness y latencia de verificación de base de datos.
- `B2BSalesCrmService`: inicio de cada caso de uso de negocio.
- `B2BSalesCrmRepository`: transacciones, auditoría y consultas relevantes de persistencia.
- `Sequelize`: SQL solo en `development` y mediante Pino, nunca en producción.

Los logs redactan automáticamente `Authorization`, cookies, tokens, contraseñas y campos sensibles. No se registran cuerpos completos de requests porque eso aumenta riesgo legal y operativo en producción.

## División interna de services B2B

Durante la revisión línea por línea se reemplazó el service monolítico por una fachada `B2BSalesCrmService` y services especializados por subdominio: cuentas, pipeline, contratos, onboarding, BNPL/facturación, cobertura y conciliación. Esta decisión mantiene los controllers estables y reduce el riesgo de que una sola clase acumule reglas incompatibles a largo plazo.
