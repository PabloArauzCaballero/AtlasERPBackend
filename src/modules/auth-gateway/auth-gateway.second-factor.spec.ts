import { AuthGatewayService } from './auth-gateway.service';
import { isPinChallenge } from './auth-gateway.types';

/**
 * El segundo factor del login interno atravesando el gateway.
 *
 * AtlasBackend exige 2FA a TODO actor interno, pero el ERP no lo atravesaba: no existía
 * `login/pin`, así que el desafío llegaba a un cliente que sólo sabía leer `accessToken` y el
 * login interno del ERP era, en la práctica, imposible de completar.
 *
 * Lo que estas pruebas fijan es la mitad que importa: mientras el segundo factor siga pendiente,
 * este gateway no emite NINGÚN token propio. Un token emitido "para ir adelantando" convertiría el
 * 2FA en un trámite opcional, y es justo el atajo que alguien reintroduce meses después para
 * arreglar un login que "se quedó a medias".
 */
describe('Segundo factor del login interno en el gateway', () => {
  const challenge = { pinChallengeRequired: true as const, challengeToken: 'desafio-opaco-1234567890', expiresInMinutes: 10 };

  const sessionUpstream = {
    accessToken: 'upstream-at',
    refreshToken: 'upstream-rt',
    tokenType: 'Bearer' as const,
    expiresIn: '15m',
    user: {
      id: '9',
      tenantId: '1',
      email: 'ada@atlas.test',
      fullName: 'Ada Interna',
      name: 'Ada Interna',
      userCode: null,
      status: 'active',
      department: 'SYSTEMS',
      jobTitle: null,
      mustChangePassword: false,
      mfaEnabled: true,
      roles: ['SUPER_ADMIN'],
      legacyRoles: ['admin'],
      permissions: [],
    },
  };

  function build() {
    const identityClient = {
      login: jest.fn().mockResolvedValue(challenge),
      loginPin: jest.fn().mockResolvedValue(sessionUpstream),
      requestPasswordChange: jest.fn().mockResolvedValue(challenge),
      confirmPasswordChange: jest.fn().mockResolvedValue({ passwordChanged: true }),
      refresh: jest.fn(),
    };
    const tokenIssuer = { issue: jest.fn().mockReturnValue({ accessToken: 'erp-at', expiresIn: '15m' }) };
    const service = new AuthGatewayService(identityClient as never, tokenIssuer as never);
    return { service, identityClient, tokenIssuer };
  }

  it('devuelve el desafío tal cual y no emite token del ERP mientras el PIN esté pendiente', async () => {
    const { service, tokenIssuer } = build();

    const outcome = await service.login('ada@atlas.test', 'secreta');

    expect(isPinChallenge(outcome)).toBe(true);
    expect(tokenIssuer.issue).not.toHaveBeenCalled();
  });

  it('sólo tras verificar el PIN nace la sesión, con los tokens upstream para las cookies', async () => {
    const { service, identityClient, tokenIssuer } = build();

    const session = await service.loginPin(challenge.challengeToken, '123456');

    expect(identityClient.loginPin).toHaveBeenCalledWith(challenge.challengeToken, '123456');
    expect(tokenIssuer.issue).toHaveBeenCalled();
    expect(session.accessToken).toBe('erp-at');
    expect(session.upstreamAccessToken).toBe('upstream-at');
    expect(session.upstreamRefreshToken).toBe('upstream-rt');
  });

  it('el cambio de contraseña viaja con el token upstream de la sesión, no con credenciales del cuerpo', async () => {
    const { service, identityClient } = build();

    const { result } = await service.requestPasswordChange({ accessToken: 'upstream-at', refreshToken: 'upstream-rt' }, 'la-actual');

    expect(identityClient.requestPasswordChange).toHaveBeenCalledWith('upstream-at', 'la-actual');
    expect(isPinChallenge(result)).toBe(true);
  });

  it('confirma el cambio pasando el desafío y el código al upstream', async () => {
    const { service, identityClient } = build();
    const body = { challengeToken: 'desafio-opaco-1234567890', code: '123456', newPassword: 'NuevaClave#2026' };

    const { result } = await service.confirmPasswordChange({ accessToken: 'upstream-at', refreshToken: 'upstream-rt' }, body);

    expect(identityClient.confirmPasswordChange).toHaveBeenCalledWith('upstream-at', body);
    expect(result).toEqual({ passwordChanged: true });
  });
});
