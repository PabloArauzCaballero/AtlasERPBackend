import { Injectable, LoggerService } from '@nestjs/common';
import type pino from 'pino';
import { env } from '../../config/env';
import { createContextLogger, LogFields, rootPinoLogger } from './root-pino-logger';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger = rootPinoLogger;

  child(context: string | LogFields): pino.Logger {
    return typeof context === 'string' ? createContextLogger(context) : this.logger.child(context);
  }

  log(message: string, context?: string | LogFields): void {
    this.logger.info(this.normalizeFields(context), message);
  }

  info(message: string, context: LogFields = {}): void {
    this.logger.info(context, message);
  }

  warn(message: string, context?: string | LogFields): void {
    this.logger.warn(this.normalizeFields(context), message);
  }

  error(message: string, traceOrContext?: string | LogFields, context?: string): void {
    this.logger.error(this.normalizeErrorFields(traceOrContext, context), message);
  }

  debug(message: string, context?: string | LogFields): void {
    this.logger.debug(this.normalizeFields(context), message);
  }

  verbose(message: string, context?: string | LogFields): void {
    this.logger.trace(this.normalizeFields(context), message);
  }

  infoContext(context: string, message: string, fields: LogFields = {}): void {
    this.logger.info({ ...fields, context }, message);
  }

  warnContext(context: string, message: string, fields: LogFields = {}): void {
    this.logger.warn({ ...fields, context }, message);
  }

  errorContext(context: string, message: string, fields: LogFields = {}): void {
    this.logger.error(this.normalizeErrorObject({ ...fields, context }), message);
  }

  debugContext(context: string, message: string, fields: LogFields = {}): void {
    this.logger.debug({ ...fields, context }, message);
  }

  private normalizeFields(context?: string | LogFields): LogFields {
    if (!context) return {};
    return typeof context === 'string' ? { context } : context;
  }

  private normalizeErrorFields(traceOrContext?: string | LogFields, context?: string): LogFields {
    if (!traceOrContext) return context ? { context } : {};
    if (typeof traceOrContext === 'string') {
      return { trace: traceOrContext, ...(context ? { context } : {}) };
    }
    return this.normalizeErrorObject(traceOrContext);
  }

  private normalizeErrorObject(fields: LogFields): LogFields {
    const error = fields.error;
    if (!(error instanceof Error)) return fields;

    return {
      ...fields,
      error: {
        name: error.name,
        message: error.message,
        stack: env.NODE_ENV === 'production' ? undefined : error.stack,
      },
    };
  }
}
