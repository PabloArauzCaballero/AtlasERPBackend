import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { env } from '../../config/env';
import type { AuthUser } from '../../common/types/auth-context.types';

export interface IssuedAccessToken {
  accessToken: string;
  expiresIn: string;
}

/**
 * Emisor propio de JWT del backend de negocio. Instancia su propio JwtService con
 * JWT_ACCESS_SECRET (igual patrón que JwtAuthGuard) en vez de inyectar el JwtModule global,
 * que está configurado con JWT_INTERNAL_SECRET para un propósito distinto (tokens de servicio).
 */
@Injectable()
export class AccessTokenIssuerService {
  private readonly jwtService = new JwtService({ secret: env.JWT_ACCESS_SECRET });

  issue(input: { sub: string; roles: string[]; email?: string }): IssuedAccessToken {
    const primaryRole = input.roles[0] ?? 'NONE';
    const payload: AuthUser = {
      sub: input.sub,
      roleCode: primaryRole,
      role: primaryRole,
      roles: input.roles,
      ...(input.email ? { email: input.email } : {}),
      tokenType: 'access',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as JwtSignOptions['expiresIn'],
    });
    return { accessToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN };
  }
}
