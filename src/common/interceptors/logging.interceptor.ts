import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { PinoLoggerService } from '../logging/pino-logger.service';
import type { AuthUser } from '../types/auth-context.types';

interface RequestWithLogContext extends Request {
  requestId?: string;
  user?: AuthUser;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly contextName = LoggingInterceptor.name;

  constructor(private readonly logger: PinoLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithLogContext>();
    const response = http.getResponse<Response>();
    const requestId = this.resolveRequestId(request);
    const startedAt = Date.now();

    response.setHeader('X-Request-Id', requestId);

    this.logger.infoContext(this.contextName, 'HTTP request started', {
      requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      userId: request.user?.sub,
      roleCode: request.user?.roleCode,
      ip: request.ip,
    });

    return next.handle().pipe(
      tap(() => {
        this.logger.infoContext(this.contextName, 'HTTP request completed', {
          requestId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          userId: request.user?.sub,
          roleCode: request.user?.roleCode,
        });
      }),
      catchError((error: unknown) => {
        this.logger.warnContext(this.contextName, 'HTTP request failed before response', {
          requestId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          userId: request.user?.sub,
          roleCode: request.user?.roleCode,
        });
        return throwError(() => error);
      }),
    );
  }

  private resolveRequestId(request: RequestWithLogContext): string {
    const existing = request.header('x-request-id')?.trim();
    const isSafeExternalRequestId =
      existing !== undefined && /^[A-Za-z0-9_.:-]{1,120}$/.test(existing);
    const requestId = isSafeExternalRequestId ? existing : randomUUID();
    request.requestId = requestId;
    return requestId;
  }
}
