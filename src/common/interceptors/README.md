# Interceptors comunes

## Responsabilidad

Esta carpeta contiene interceptors globales de NestJS usados para trazabilidad y normalización de respuestas.

## Archivos

- `logging.interceptor.ts`: registra cada request HTTP con Pino, genera o propaga `X-Request-Id`, mide duración y no registra cuerpos ni secretos.
- `response.interceptor.ts`: normaliza respuestas exitosas con `{ success: true, data }`.

## Qué no debe ir aquí

- Reglas de negocio.
- Acceso a Sequelize.
- Validaciones de DTOs.
- Logs con tokens, cookies, contraseñas o bodies completos.
