import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface RequestWithRequestId extends Request {
  requestId?: string;
}

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;

/**
 * El id con el que se sigue una petición: `x-request-id` si llega y es seguro; si no,
 * `x-correlation-id`, que es la cabecera que mandan los clientes de Atlas.
 *
 * Hasta ahora sólo se leía la primera, y el portal del ERP manda la segunda desde `87b6069`. Su id
 * se descartaba en silencio y cada petición recibía uno nuevo, así que la correlación que prometía
 * aquel commit no llegaba a ningún sitio: nada fallaba, simplemente no se podía seguir nada.
 */
function firstSafe(...candidatos: Array<string | undefined>): string | undefined {
  return candidatos.find(
    (candidato) => candidato !== undefined && SAFE_REQUEST_ID_PATTERN.test(candidato),
  );
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: RequestWithRequestId, response: Response, next: NextFunction): void {
    const requestId =
      firstSafe(request.header('x-request-id'), request.header('x-correlation-id')) ?? randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
