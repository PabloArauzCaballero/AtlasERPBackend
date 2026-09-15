import { AccessTokenIssuerService } from '../src/modules/auth-gateway/access-token-issuer.service';
import { AuthGatewayService } from '../src/modules/auth-gateway/auth-gateway.service';
import { InternalUserMirrorService } from '../src/modules/auth-gateway/internal-user-mirror.service';

/**
 * El `sub` del token del ERP tiene que ser el uuid de `atlas_sales.internal_users`, no el id opaco
 * de AtlasBackend. Regresión medida el 2026-09-14: con `sub = "1"` crear una cuenta B2B moría en
 * «invalid input syntax for type uuid: "1"».
 */
const UUID = '74ec000b-85d5-42fc-9b91-ed24ce057de5';

function buildMirror(existing: { id: string } | null) {
  const model = {
    findOne: jest.fn(async () => existing),
    create: jest.fn(async (values: Record<string, unknown>) => ({ id: UUID, ...values })),
  };
  return { mirror: new InternalUserMirrorService(model as never), model };
}

describe('InternalUserMirrorService', () => {
  it('devuelve el uuid del reflejo existente buscando por correo normalizado', async () => {
    const { mirror, model } = buildMirror({ id: UUID });
    await expect(mirror.resolveId({ email: '  Ana@Atlas.Test ', roleCode: 'ADMIN' })).resolves.toBe(
      UUID,
    );
    expect(model.findOne).toHaveBeenCalledWith({ where: { email: 'ana@atlas.test' } });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('crea el reflejo cuando la persona autenticó arriba pero no existe aquí', async () => {
    const { mirror, model } = buildMirror(null);
    await expect(
      mirror.resolveId({
        email: 'nueva@atlas.test',
        fullName: 'Nueva Analista',
        roleCode: 'FINANCE',
      }),
    ).resolves.toBe(UUID);
    expect(model.create).toHaveBeenCalledWith({
      email: 'nueva@atlas.test',
      fullName: 'Nueva Analista',
      roleCode: 'FINANCE',
      isActive: true,
    });
  });
});

describe('AuthGatewayService · sesión interna', () => {
  it('emite sub = uuid del ERP y conserva el id de Atlas como atlasUserId', async () => {
    const issued: Array<Record<string, unknown>> = [];
    const tokenIssuer = {
      issue: jest.fn((input: Record<string, unknown>) => {
        issued.push(input);
        return { accessToken: 'jwt', expiresIn: '15m' };
      }),
    };
    const identityClient = {
      loginPin: jest.fn(async () => ({
        accessToken: 'up-at',
        refreshToken: 'up-rt',
        user: {
          id: '1',
          tenantId: '1',
          email: 'ana@atlas.test',
          fullName: 'Ana',
          name: 'Ana',
          userCode: null,
          status: 'active',
          department: null,
          jobTitle: null,
          mustChangePassword: false,
          mfaEnabled: true,
          roles: ['SUPER_ADMIN'],
        },
      })),
    };
    const { mirror } = buildMirror({ id: UUID });
    const service = new AuthGatewayService(
      identityClient as never,
      tokenIssuer as never as AccessTokenIssuerService,
      mirror,
    );

    const session = await service.loginPin('challenge', '123456');

    expect(session.accessToken).toBe('jwt');
    expect(issued[0]).toMatchObject({ sub: UUID, atlasUserId: '1', email: 'ana@atlas.test' });
    expect(issued[0]?.sub).not.toBe('1');
  });
});
