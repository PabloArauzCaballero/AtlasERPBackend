import type { HttpException} from '@nestjs/common';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { AtlasIdentityClient } from '../src/modules/auth-gateway/atlas-identity.client';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '../src/modules/auth-gateway/auth-gateway.schemas';

/** Recuperación de contraseña del ERP: se reenvía al proveedor como actor interno y nada más. */
function clientReturning(response: () => unknown) {
  const calls: Record<string, unknown>[] = [];
  const http = {
    request: (config: Record<string, unknown>) => {
      calls.push(config);
      return response() as ReturnType<HttpService['request']>;
    },
  } as unknown as HttpService;
  return { client: new AtlasIdentityClient(http), calls };
}

function failWith(status: number, message: string) {
  return () =>
    throwError(
      () =>
        new AxiosError('fallo', 'ERR', undefined, undefined, {
          status,
          statusText: '',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: { error: { message } },
        }),
    );
}

describe('AtlasIdentityClient — recuperación de contraseña', () => {
  it('pide el código como internal_user, con tenant y producto ERP', async () => {
    const { client, calls } = clientReturning(() => of({ data: { data: { requested: true } } }));

    await expect(client.requestPasswordReset('persona@atlas.test')).resolves.toEqual({ requested: true });

    expect(calls[0]?.url).toMatch(/\/auth\/password-reset\/request$/);
    expect(calls[0]?.data).toEqual({ actorType: 'internal_user', identifier: 'persona@atlas.test' });
    const headers = calls[0]?.headers as Record<string, string>;
    expect(headers['x-tenant-id']).toBeDefined();
    expect(headers['x-atlas-product']).toBe('erp');
    expect(headers.Authorization).toBeUndefined();
  });

  it('confirma con código y contraseña nueva', async () => {
    const { client, calls } = clientReturning(() => of({ data: { data: { passwordChanged: true } } }));

    await expect(
      client.confirmPasswordReset({ email: 'persona@atlas.test', code: '123456', newPassword: 'una-clave-larga' }),
    ).resolves.toEqual({ passwordChanged: true });
    expect(calls[0]?.url).toMatch(/\/auth\/password-reset\/confirm$/);
    expect(calls[0]?.data).toEqual({
      actorType: 'internal_user',
      identifier: 'persona@atlas.test',
      code: '123456',
      newPassword: 'una-clave-larga',
    });
  });

  it('un código malo es 401 con el mensaje genérico del proveedor', async () => {
    const { client } = clientReturning(failWith(401, 'Código inválido o expirado.'));
    const error = await client
      .confirmPasswordReset({ email: 'a@b.co', code: '000000', newPassword: 'una-clave-larga' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).toBe('Código inválido o expirado.');
  });

  it('el límite del proveedor sigue siendo 429, y el correo caído 503', async () => {
    const limited = await clientReturning(failWith(429, 'Demasiadas solicitudes'))
      .client.requestPasswordReset('a@b.co')
      .catch((caught: unknown) => caught);
    expect((limited as HttpException).getStatus()).toBe(429);

    const down = await clientReturning(failWith(503, 'correo no configurado'))
      .client.requestPasswordReset('a@b.co')
      .catch((caught: unknown) => caught);
    expect(down).toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Esquemas de recuperación', () => {
  it('rechazan un correo inválido, un código que no son 6 dígitos y una contraseña corta', () => {
    expect(passwordResetRequestSchema.safeParse({ email: 'no-es-correo' }).success).toBe(false);
    const base = { email: 'a@b.co', code: '123456', newPassword: 'una-clave-larga' };
    expect(passwordResetConfirmSchema.safeParse(base).success).toBe(true);
    expect(passwordResetConfirmSchema.safeParse({ ...base, code: '12345' }).success).toBe(false);
    expect(passwordResetConfirmSchema.safeParse({ ...base, newPassword: 'corta' }).success).toBe(false);
  });

  it('no aceptan que quien llama elija el tipo de actor', () => {
    const parsed = passwordResetRequestSchema.safeParse({ email: 'a@b.co', actorType: 'platform_user' });
    expect(parsed.success && 'actorType' in parsed.data).toBe(false);
  });
});
