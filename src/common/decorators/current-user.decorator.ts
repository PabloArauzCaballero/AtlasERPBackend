import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser, RequestWithAuthUser } from '../types/auth-context.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuthUser>();

    if (!request.user) {
      throw new UnauthorizedException('Usuario autenticado no disponible.');
    }

    return request.user;
  },
);
