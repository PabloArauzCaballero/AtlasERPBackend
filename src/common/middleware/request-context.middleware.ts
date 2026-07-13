import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface RequestWithRequestId extends Request {
  requestId?: string;
}

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: RequestWithRequestId, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId =
      incomingRequestId && SAFE_REQUEST_ID_PATTERN.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
