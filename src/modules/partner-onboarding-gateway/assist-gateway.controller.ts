import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnyAuthenticated } from '../../common/decorators/any-authenticated.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-context.types';
import { env } from '../../config/env';

/** Cookie del token de identidad upstream, la misma que emite el gateway de autenticación. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/**
 * Cuánto se espera al asistente. Más que `ATLAS_IDENTITY_TIMEOUT_MS` a propósito: detrás de Core
 * hay un modelo de lenguaje, y una respuesta de diez segundos es normal, no una caída.
 */
const ASSIST_TIMEOUT_MS = 45_000;

/** Los roles que sólo tiene una sesión de COMERCIO (ver `mapMerchantRoles`). */
const ROLES_DE_COMERCIO = new Set(['MERCHANT_ADMIN', 'MERCHANT']);

export type SuperficieDelAsistente = 'merchant-portal' | 'erp-staff';

/**
 * Qué asistente le toca a esta sesión: el del portal de comercio o el del personal de Atlas.
 *
 * Lo decide el TOKEN, nunca el navegador. Si la superficie viajara en el cuerpo, un comercio podría
 * pedir `erp-staff` y leer el catálogo del personal interno cambiando una cadena. Una sesión es de
 * comercio cuando TODOS sus roles son de comercio: la del personal nunca trae `MERCHANT_ADMIN`
 * (`role-mapping.ts`), y una sesión que mezcle roles —la de pruebas locales, que los trae todos— se
 * trata como personal, que es lo que es.
 */
export function superficieDeLaSesion(user: AuthUser): SuperficieDelAsistente {
  const roles = [user.roleCode, user.role, ...(user.roles ?? [])]
    .map((role) => role?.trim().toUpperCase())
    .filter((role): role is string => Boolean(role));
  return roles.length > 0 && roles.every((role) => ROLES_DE_COMERCIO.has(role))
    ? 'merchant-portal'
    : 'erp-staff';
}

/** Sólo los campos del contrato del chat; lo demás que mande el navegador no cruza. */
function cuerpoDelChat(body: unknown, surface: SuperficieDelAsistente): Record<string, unknown> {
  const recibido = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  return {
    surface,
    prompt: recibido.prompt,
    clientMessageId: recibido.clientMessageId,
    ...(recibido.conversationId !== undefined ? { conversationId: recibido.conversationId } : {}),
    ...(recibido.screen !== undefined ? { screen: recibido.screen } : {}),
  };
}

interface ErrorDeCore {
  error?: { code?: unknown; message?: unknown };
  code?: unknown;
  message?: unknown;
}

/**
 * Atlas Assist en el ERP y en el portal de comercio, reenviado a AtlasBackend.
 *
 * ## Por qué existe
 *
 * Por la misma razón que la pasarela de soporte: el navegador **nunca habla con AtlasBackend
 * directamente**, sólo con este origen. El asistente vive en Core (`/internal/assist/*`), que es
 * quien guarda la conversación y llama al servicio de IA con su clave; aquí sólo se cruza, con el
 * token del ACTOR (cookie `atlas_upstream_at`), nunca con una credencial de máquina.
 *
 * ## Qué hace además de reenviar
 *
 * Una cosa: fija la `surface` según el tipo de sesión (`superficieDeLaSesion`) y descarta la que
 * mande el navegador.
 *
 * ## Por qué no usa `AtlasPartnerClient.forward`
 *
 * Porque ese cliente traduce los errores a excepciones de Nest y en el camino pierde lo que el
 * asistente necesita para comportarse bien: el `code` (`ASSIST_DISABLED`, `ASSIST_IN_FLIGHT`…), el
 * 429 —que convierte en 500— y la cabecera `Retry-After`, que dice cuánto esperar antes de repetir
 * la MISMA consulta. Aquí se conservan los tres.
 */
@Controller('internal/assist')
export class AssistGatewayController {
  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }

  @Post('chat')
  @HttpCode(200)
  @AnyAuthenticated()
  chat(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reenviar(
      {
        method: 'POST',
        path: 'internal/assist/chat',
        accessToken: this.token(req),
        body: cuerpoDelChat(body, superficieDeLaSesion(user)),
      },
      res,
    );
  }

  @Get('conversation')
  @AnyAuthenticated()
  conversacion(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const surface = superficieDeLaSesion(user);
    return this.reenviar(
      {
        method: 'GET',
        path: `internal/assist/conversation?surface=${encodeURIComponent(surface)}`,
        accessToken: this.token(req),
      },
      res,
    );
  }

  private async reenviar(
    input: {
      method: 'GET' | 'POST';
      path: string;
      accessToken: string | undefined;
      body?: unknown;
    },
    res: Response,
  ): Promise<unknown> {
    if (!input.accessToken) {
      throw new UnauthorizedException('No hay sesión de identidad para hablar con el asistente.');
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${env.ATLAS_IDENTITY_BASE_URL}/${input.path}`, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'x-tenant-id': env.ATLAS_IDENTITY_TENANT_ID,
          Accept: 'application/json',
          ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
        signal: AbortSignal.timeout(ASSIST_TIMEOUT_MS),
      });
    } catch {
      // Sin respuesta (plazo, DNS, conexión rechazada): el asistente no está, no es un fallo de
      // quien pregunta. Se dice con el mismo código que usa Core para ese caso.
      throw new HttpException(
        {
          code: 'ASSIST_UNAVAILABLE',
          message: 'El asistente no está disponible en este momento. Inténtelo en unos minutos.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const payload = (await upstream.json().catch(() => null)) as unknown;

    if (!upstream.ok) {
      const retryAfter = upstream.headers.get('retry-after')?.trim();
      if (retryAfter && /^\d{1,3}$/.test(retryAfter)) res.setHeader('Retry-After', retryAfter);

      const cuerpo = (payload && typeof payload === 'object' ? payload : {}) as ErrorDeCore;
      const error = cuerpo.error ?? cuerpo;
      // Un 5xx de arriba es «el asistente no está»; los 4xx se conservan tal cual, porque cada uno
      // pide algo distinto en pantalla (apagado, repetir, esperar, reformular, volver a entrar).
      const status =
        upstream.status >= 500 ? HttpStatus.SERVICE_UNAVAILABLE : (upstream.status as HttpStatus);
      const code =
        typeof error.code === 'string'
          ? error.code
          : status === HttpStatus.SERVICE_UNAVAILABLE
            ? 'ASSIST_UNAVAILABLE'
            : undefined;
      const message =
        typeof error.message === 'string' && error.message
          ? error.message
          : 'El asistente no respondió. Inténtelo otra vez en unos minutos.';
      throw new HttpException({ ...(code ? { code } : {}), message }, status);
    }

    // AtlasBackend envuelve en `{ requestId, data, timestamp }`: el portal recibe el contrato.
    return payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload;
  }
}
