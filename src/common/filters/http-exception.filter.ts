import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  BaseError as SequelizeBaseError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { env } from '../../config/env';
import { PinoLoggerService } from '../logging/pino-logger.service';

interface HttpExceptionPayload {
  code?: string;
  message?: string;
  details?: unknown[];
}

interface NormalizedException {
  status: number;
  code: string;
  message: string;
  details?: unknown[];
}

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const normalized = this.normalizeException(exception);

    if (normalized.status >= 500) {
      this.logger.errorContext(
        HttpExceptionFilter.name,
        'Unhandled or infrastructure exception mapped to HTTP response',
        {
          status: normalized.status,
          code: normalized.code,
          message: normalized.message,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
      );
    }

    response.status(normalized.status).json({
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
    });
  }

  private normalizeException(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const parsedPayload = this.parseHttpPayload(payload);

      return {
        status,
        code: parsedPayload.code ?? this.statusToCode(status),
        message: parsedPayload.message ?? exception.message,
        ...(parsedPayload.details ? { details: parsedPayload.details } : {}),
      };
    }

    if (exception instanceof UniqueConstraintError) {
      return {
        status: HttpStatus.CONFLICT,
        code: 'UNIQUE_CONSTRAINT_ERROR',
        message: 'Ya existe un registro con valores únicos repetidos.',
      };
    }

    if (exception instanceof ForeignKeyConstraintError) {
      return {
        status: HttpStatus.CONFLICT,
        code: 'FOREIGN_KEY_CONSTRAINT_ERROR',
        message: 'La operación viola una relación requerida entre registros.',
      };
    }

    if (exception instanceof SequelizeValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'DATABASE_VALIDATION_ERROR',
        message: 'La base de datos rechazó los datos enviados.',
        details: exception.errors.map((error) => ({ path: error.path, message: error.message })),
      };
    }

    if (exception instanceof SequelizeBaseError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'DATABASE_ERROR',
        message: 'Ocurrió un error al consultar o modificar la base de datos.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'Ocurrió un error inesperado.'
          : exception instanceof Error
            ? exception.message
            : 'Ocurrió un error inesperado.',
    };
  }

  private parseHttpPayload(payload: string | object): HttpExceptionPayload {
    if (typeof payload === 'string') {
      return { message: payload };
    }

    const record = payload as Record<string, unknown>;
    const message = Array.isArray(record.message) ? record.message.join('; ') : record.message;
    const parsed: HttpExceptionPayload = {};

    if (typeof record.code === 'string') {
      parsed.code = record.code;
    }

    if (typeof message === 'string') {
      parsed.message = message;
    }

    if (Array.isArray(record.details)) {
      parsed.details = record.details;
    }

    return parsed;
  }

  private statusToCode(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    };

    return codes[status] ?? 'INTERNAL_SERVER_ERROR';
  }
}
