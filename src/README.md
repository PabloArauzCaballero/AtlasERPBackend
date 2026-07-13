# Carpeta `src`

Contiene el código fuente TypeScript de la API NestJS.

## Responsabilidad

Agrupa el arranque de la aplicación, configuración, base de datos, elementos comunes y módulos funcionales.

## Convenciones

- `main.ts` solo inicializa NestJS, seguridad global, CORS, filtros e interceptores.
- `app.module.ts` registra módulos principales y guards globales.
- La lógica de negocio vive en `src/modules`.
- El acceso a datos vive en repositories y modelos Sequelize.
- La validación de entradas externas se realiza con Zod.

## Qué no debe ir aquí

- Secretos o credenciales.
- Lógica de negocio directamente en `main.ts`.
- Rutas Express manuales.
