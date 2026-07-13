import pino from 'pino';
import { env } from '../../config/env';

export type LogFields = Record<string, unknown>;

const sensitiveLogPaths = [
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
    paths: sensitiveLogPaths,
    censor: '[REDACTED]',
  },
});

export function createContextLogger(context: string): pino.Logger {
  return rootPinoLogger.child({ context });
}
