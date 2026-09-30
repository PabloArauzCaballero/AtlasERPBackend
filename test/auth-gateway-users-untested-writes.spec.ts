import type { Request, Response } from 'express';
import { AuthGatewayController } from '../src/modules/auth-gateway/auth-gateway.controller';

/**
 * Cubre el hallazgo UNTESTED_WRITE: `PATCH auth/users/:userId` y `PATCH auth/users/:userId/roles`
 * no tenían ningún test que los nombrara por su ruta HTTP. A diferencia de las pasarelas de
 * partner-onboarding/soporte, `AuthGatewayController` SÍ valida el cuerpo con Zod antes de llamar
 * al servicio (`updateInternalUserSchema` / `replaceInternalUserRolesSchema`), así que se fija
 * también que el `id` de la ruta y el cuerpo validado lleguen intactos al servicio, y que la
 * cookie de refresco reenviada se reaplique cuando el servicio la renueva. La protección de rol
 * (`ADMIN`) está en `test/untested-writes-roles-guard.spec.ts`.
 */
describe('AuthGatewayController: rutas de escritura sin test previo', () => {
  function build() {
    const service = {
      updateUser: jest.fn(),
      replaceUserRoles: jest.fn(),
    };
    const controller = new AuthGatewayController(service as never);
    const req = {
      cookies: { atlas_upstream_at: 'access-del-actor', atlas_upstream_rt: 'refresh-del-actor' },
    } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
    return { controller, service, req, res };
  }

  it('PATCH auth/users/:userId actualiza al usuario con el id de la ruta y el token del actor', async () => {
    const { controller, service, req, res } = build();
    const usuario = { id: '42', fullName: 'Ana Admin' };
    service.updateUser.mockResolvedValue({ result: usuario, refreshedTokens: undefined });
    const body = { fullName: 'Ana Admin', reason: 'corrige el nombre tras el matrimonio' };

    const respuesta = await controller.updateUser({ id: '42' }, body as never, req, res);

    expect(service.updateUser).toHaveBeenCalledWith(
      { accessToken: 'access-del-actor', refreshToken: 'refresh-del-actor' },
      '42',
      body,
    );
    expect(respuesta).toEqual({ user: usuario });
  });

  it('PATCH auth/users/:userId reaplica las cookies cuando el servicio renueva la sesión', async () => {
    const { controller, service, req, res } = build();
    const refreshedTokens = { accessToken: 'nuevo-at', refreshToken: 'nuevo-rt', expiresIn: '1h' };
    service.updateUser.mockResolvedValue({ result: { id: '42' }, refreshedTokens });

    await controller.updateUser(
      { id: '42' },
      { reason: 'corrige el nombre tras el matrimonio' } as never,
      req,
      res,
    );

    expect(res.cookie).toHaveBeenCalled();
  });

  it('PATCH auth/users/:userId/roles reemplaza los roles del usuario con el id de la ruta', async () => {
    const { controller, service, req, res } = build();
    const usuario = { id: '42', roles: ['ADMIN', 'AUDITOR'] };
    service.replaceUserRoles.mockResolvedValue({ result: usuario, refreshedTokens: undefined });
    const body = { roles: ['ADMIN', 'AUDITOR'], reason: 'ampliación de funciones aprobada' };

    const respuesta = await controller.replaceUserRoles({ id: '42' }, body as never, req, res);

    expect(service.replaceUserRoles).toHaveBeenCalledWith(
      { accessToken: 'access-del-actor', refreshToken: 'refresh-del-actor' },
      '42',
      body,
    );
    expect(respuesta).toEqual({ user: usuario });
  });

  it('PATCH auth/users/:userId/roles sin cookies llama al servicio sin token (AtlasBackend responde 401)', async () => {
    const { controller, service, res } = build();
    service.replaceUserRoles.mockResolvedValue({
      result: { id: '42' },
      refreshedTokens: undefined,
    });
    const req = { cookies: {} } as unknown as Request;

    await controller.replaceUserRoles(
      { id: '42' },
      { roles: ['ADMIN'], reason: 'ampliación de funciones aprobada' } as never,
      req,
      res,
    );

    expect(service.replaceUserRoles).toHaveBeenCalledWith(
      { accessToken: undefined, refreshToken: undefined },
      '42',
      expect.any(Object),
    );
  });
});
