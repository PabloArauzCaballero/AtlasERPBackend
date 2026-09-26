import pino from 'pino';
import { env } from '../../config/env';

export type LogFields = Record<string, unknown>;

/**
 * Claves que nunca se escriben en claro, en cualquier logger del proceso (el raíz y `pino-http`).
 *
 * Además de credenciales, los datos personales que viajan por las rutas financieras y de sesión:
 * correo, teléfono, documento, contraseñas de los flujos de cambio y el PIN del segundo factor
 * (P-13). Es defensa en profundidad: los servicios ya no deberían pasarlos al log, y si alguno lo
 * hace, sale `[REDACTED]`.
 */
export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.query',
  'req.body',
  'authorization',
  'cookie',
  'email',
  '*.email',
  'phone',
  '*.phone',
  'documentNumber',
  '*.documentNumber',
  'currentPassword',
  '*.currentPassword',
  'newPassword',
  '*.newPassword',
  'pin',
  '*.pin',
  'challengeToken',
  '*.challengeToken',
];

const sensitiveLogPaths = [
  ...SENSITIVE_LOG_PATHS,
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'body.password',
  'body.passwordHash',
  'body.accessToken',
  'body.refreshToken',
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
];

export const rootPinoLogger = pino({
  name: 'atlas-integrated-backend',
  level: env.LOG_LEVEL,
  base: {
    service: 'atlas-integrated-backend',
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [...new Set(sensitiveLogPaths)],
    censor: '[REDACTED]',
  },
});

export function createContextLogger(context: string): pino.Logger {
  return rootPinoLogger.child({ context });
}
