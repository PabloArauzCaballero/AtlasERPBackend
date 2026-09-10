import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { HttpAccessRegistryService } from '../observability/http-access-registry.service';
import { PinoLoggerService } from '../logging/pino-logger.service';
import type { AuthUser } from '../types/auth-context.types';

interface RequestWithLogContext extends Request {
  requestId?: string;
  user?: AuthUser;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly contextName = LoggingInterceptor.name;

  constructor(
    private readonly logger: PinoLoggerService,
    private readonly accesos: HttpAccessRegistryService,
  ) {}

  /**
   * La PLANTILLA de la ruta (`/x/:id`), no la URL concreta. Express la deja en `route.path` una vez
   * resuelto el manejador; si no está —404 sin ruta, por ejemplo— se cae a la URL sin query, que es
   * lo mejor que se puede decir sin inventar.
   */
  private routeTemplate(request: RequestWithLogContext): string {
    const plantilla = (request as { route?: { path?: string } }).route?.path;
    if (plantilla) return `${request.baseUrl ?? ''}${plantilla}`;
    return (request.originalUrl ?? request.url).split('?')[0] ?? request.url;
  }

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
        this.accesos.record(request.method, this.routeTemplate(request), response.statusCode);
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
        // Cuando el manejador lanza, `response.statusCode` sigue siendo el 200 por defecto: el filtro
        // de excepciones aún no ha corrido. El estado real lo lleva la excepción, y hay que leerlo de
        // ahí: contar un `BadRequestException` como 500 convertiría «el flujo rechazó una entrada
        // inválida, que es su trabajo» en «el flujo está roto». Sólo lo que no es `HttpException` —un
        // fallo no previsto— es un 500 de verdad.
        const estado = error instanceof HttpException ? error.getStatus() : 500;
        this.accesos.record(request.method, this.routeTemplate(request), estado);
        this.logger.warnContext(this.contextName, 'HTTP request failed before response', {
          requestId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: estado,
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
