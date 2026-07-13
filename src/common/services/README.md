# Servicios comunes

Esta carpeta contiene servicios compartidos por más de un módulo de dominio.

## Responsabilidad

- Exponer reglas transversales que no pertenecen exclusivamente a CRM, contabilidad o publicidad.
- Mantener lógica reutilizable concreta, no utilidades genéricas sin dueño.

## Archivos

### legal-entity-access.service.ts

Valida que el usuario autenticado pueda operar una entidad legal concreta. Es usado por módulos que requieren aislamiento por compañía o entidad legal.

## Qué no debe ir aquí

- Repositories Sequelize.
- Controllers HTTP.
- Reglas específicas de un único módulo cuando no existe reutilización real.
