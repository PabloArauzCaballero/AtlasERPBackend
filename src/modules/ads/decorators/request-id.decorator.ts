import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

interface RequestWithRequestId {
  requestId?: string;
}

export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithRequestId>();
    return request.requestId ?? 'unknown';
  },
);
