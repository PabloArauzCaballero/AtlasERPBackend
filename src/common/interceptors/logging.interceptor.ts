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

    /**
     * El registro de accesos se anota cuando la respuesta ya SALIÓ, no cuando el manejador termina.
     *
     * En ese momento `statusCode` es el definitivo: el 201 de un POST, el 204 de un borrado y el
     * código que puso el filtro de excepciones si hubo error. Dentro del `tap` todavía no lo es
     * —Express arranca en 200 y Nest fija el estado al enviar, después de los interceptores—, así
     * que un POST que responde 201 se habría anotado como 200. Para decidir si algo está roto da
     * igual; para una evidencia que alguien va a leer, no: un código inventado es un código falso.
     */
    response.once('finish', () => {
      this.accesos.record(request.method, this.routeTemplate(request), response.statusCode);
    });

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
        // Aquí `response.statusCode` sigue siendo el 200 por defecto —el filtro de excepciones aún no
        // ha corrido—, así que para el LOG el estado se lee de la excepción, que es quien lo lleva.
        // El registro de accesos no lo necesita: se anota en `finish`, cuando ya es el definitivo.
        const estado = error instanceof HttpException ? error.getStatus() : 500;
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
    // Lo resuelve `RequestContextMiddleware`, que corre antes. Releer aquí la cabecera con OTRO patrón
    // (1-120 caracteres frente a 8-120) daba dos ids para la misma petición cuando el valor cabía en
    // uno y no en el otro, y además ignoraba el `x-correlation-id` que el middleware sí acepta.
    if (request.requestId) return request.requestId;
    const existing = request.header('x-request-id')?.trim();
    const isSafeExternalRequestId =
      existing !== undefined && /^[A-Za-z0-9_.:-]{1,120}$/.test(existing);
    const requestId = isSafeExternalRequestId ? existing : randomUUID();
    request.requestId = requestId;
    return requestId;
  }
}
