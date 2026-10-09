import { ForbiddenException, type HttpException, UnauthorizedException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Request, Response } from 'express';
import { throwError } from 'rxjs';
import { AtlasPartnerClient } from '../partner-onboarding-gateway/atlas-partner.client';
import { AtlasIdentityClient } from './atlas-identity.client';
import { AuthGatewayController } from './auth-gateway.controller';
import { merchantReauthenticateSchema } from './auth-gateway.schemas';
import { AuthGatewayService } from './auth-gateway.service';

/**
 * ERP-03 — la reautenticación del comercio antes de cambiar su cuenta de cobro, vista desde la
 * pasarela: reenviar la contraseña con el token upstream de la sesión, devolver la prueba tal cual
 * y, sobre todo, NO perder el código de negocio de los errores. Sin `REAUTH_REQUIRED` el portal no
 * sabe que tiene que pedir la contraseña; sin `ACCOUNT_LOCKED` no sabe decir hasta cuándo esperar.
 */
function axiosFallo(status: number, body: unknown): AxiosError {
  return new AxiosError('fallo', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: body,
  });
}

describe('Reautenticación del comercio en la pasarela', () => {
  it('el controlador reenvía la contraseña con los tokens upstream y devuelve la prueba', async () => {
    const prueba = { reauthToken: 't', expiresInSeconds: 300, expiresAt: '2026-10-09T10:05:00Z' };
    const service = { merchantReauthenticate: jest.fn().mockResolvedValue({ result: prueba }) };
    const controller = new AuthGatewayController(service as never);
    const req = {
      cookies: { atlas_upstream_at: 'at', atlas_upstream_rt: 'rt' },
    } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    await expect(
      controller.merchantReauthenticate({ password: 'secreta' }, req, res),
    ).resolves.toEqual(prueba);
    expect(service.merchantReauthenticate).toHaveBeenCalledWith(
      { accessToken: 'at', refreshToken: 'rt' },
      'secreta',
    );
  });

  it('el servicio llama al endpoint de AtlasBackend con el token del actor', async () => {
    const identityClient = {
      merchantReauthenticate: jest.fn().mockResolvedValue({ reauthToken: 't' }),
    };
    const service = new AuthGatewayService(identityClient as never, {} as never, {} as never);

    await expect(service.merchantReauthenticate({ accessToken: 'at' }, 'secreta')).resolves.toEqual(
      { result: { reauthToken: 't' } },
    );
    expect(identityClient.merchantReauthenticate).toHaveBeenCalledWith('at', 'secreta');
  });

  it('el esquema sólo admite una contraseña no vacía', () => {
    expect(merchantReauthenticateSchema.safeParse({ password: '' }).success).toBe(false);
    expect(merchantReauthenticateSchema.safeParse({ password: 'x' }).success).toBe(true);
  });

  describe('el cliente de identidad conserva el código', () => {
    function cliente(status: number, body: unknown) {
      const http = { request: jest.fn(() => throwError(() => axiosFallo(status, body))) };
      return new AtlasIdentityClient(http as never);
    }

    it('contraseña errada: 400 con REAUTH_INVALID_PASSWORD', async () => {
      const error = await cliente(400, {
        error: { code: 'REAUTH_INVALID_PASSWORD', message: 'La contraseña no es correcta.' },
      })
        .merchantReauthenticate('at', 'x')
        .then(
          () => {
            throw new Error('debía fallar');
          },
          (e: unknown) => e as HttpException,
        );
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        code: 'REAUTH_INVALID_PASSWORD',
        message: 'La contraseña no es correcta.',
      });
    });

    it('cuenta bloqueada: 429 con ACCOUNT_LOCKED, no un 400 genérico', async () => {
      const error = await cliente(429, { error: { code: 'ACCOUNT_LOCKED', message: 'Bloqueada.' } })
        .merchantReauthenticate('at', 'x')
        .then(
          () => {
            throw new Error('debía fallar');
          },
          (e: unknown) => e as HttpException,
        );
      expect(error.getStatus()).toBe(429);
      expect(error.getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    });

    it('sin código upstream se conserva sólo el mensaje, como antes', async () => {
      const error = await cliente(401, { error: { message: 'Sin sesión.' } })
        .merchantReauthenticate('at', 'x')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe('Sin sesión.');
    });
  });

  describe('el cliente del expediente conserva el código', () => {
    function cliente(status: number, body: unknown) {
      const http = { request: jest.fn(() => throwError(() => axiosFallo(status, body))) };
      return new AtlasPartnerClient(http as never);
    }

    it('registrar el QR sin prueba: 403 REAUTH_REQUIRED llega al portal con su código', async () => {
      const error = await cliente(403, {
        error: { code: 'REAUTH_REQUIRED', message: 'Confirma tu contraseña.' },
      })
        .forward({ method: 'POST', path: 'partner-onboarding/1/qr-codes', accessToken: 'at' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'REAUTH_REQUIRED',
        message: 'Confirma tu contraseña.',
      });
      expect((error as ForbiddenException).message).toBe('Confirma tu contraseña.');
    });

    it('429 se conserva', async () => {
      const error = await cliente(429, { error: { message: 'Demasiadas peticiones.' } })
        .forward({ method: 'POST', path: 'x', accessToken: 'at' })
        .then(
          () => {
            throw new Error('debía fallar');
          },
          (e: unknown) => e as HttpException,
        );
      expect(error.getStatus()).toBe(429);
    });
  });
});
