# Carpeta `src/modules`

Contiene los módulos funcionales de NestJS.

## Responsabilidad

Cada subcarpeta representa un dominio o feature con controllers, services, repositories, schemas, DTOs, modelos y documentación propia.

## Convenciones

- Cada módulo debe exponer un archivo `*.module.ts`.
- Los controllers deben ser delgados.
- Los services concentran casos de uso.
- Los repositories encapsulan Sequelize.
- No se deben crear controllers genéricos.
