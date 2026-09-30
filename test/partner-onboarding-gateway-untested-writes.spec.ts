import type { Request } from 'express';
import { PartnerOnboardingGatewayController } from '../src/modules/partner-onboarding-gateway/partner-onboarding-gateway.controller';

/**
 * Cubre el hallazgo UNTESTED_WRITE (auditoría de flujos, mismo lote que documentó PR #32 en el
 * contrato OpenAPI): estas rutas de escritura no tenían ningún test que las nombrara por su ruta
 * HTTP. Esta pasarela es un reenvío puro hacia AtlasBackend (ver cabecera del controlador): la
 * responsabilidad de ESTE repo no es el negocio, sino que la ruta exista y reenvíe con el token del
 * actor y el cuerpo intacto. La protección de rol/sesión está en
 * `test/untested-writes-roles-guard.spec.ts`.
 */
describe('PartnerOnboardingGatewayController: rutas de escritura sin test previo', () => {
  function build() {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const controller = new PartnerOnboardingGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, forward, req };
  }

  it('POST partner-onboarding/start reenvía el cuerpo con el token del actor', async () => {
    const { controller, forward, req } = build();
    const body = { legalName: 'Comercio Alfa' };
    await controller.start(req, body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/start',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/start sin cookie reenvía sin token (AtlasBackend responde 401)', async () => {
    const { controller, forward } = build();
    await controller.start({ cookies: {} } as unknown as Request, {});
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }));
  });

  it('PATCH partner-onboarding/:id/commercial-profile reenvía al partnerId correcto', async () => {
    const { controller, forward, req } = build();
    const body = { fachada: 'Tienda Alfa' };
    await controller.updateCommercialProfile(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'PATCH',
      path: 'partner-onboarding/partner-1/commercial-profile',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/commercial-registry reenvía la matrícula', async () => {
    const { controller, forward, req } = build();
    const body = { numeroMatricula: '123-ABC' };
    await controller.setCommercialRegistry(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/commercial-registry',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/legal-representative reenvía al representante legal', async () => {
    const { controller, forward, req } = build();
    const body = { nombreCompleto: 'Ana Representante' };
    await controller.addLegalRepresentative(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/legal-representative',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/documents/upload-url pide la URL de subida', async () => {
    const { controller, forward, req } = build();
    const body = { contentType: 'application/pdf' };
    await controller.documentUploadUrl(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/documents/upload-url',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/submit reenvía sin cuerpo', async () => {
    const { controller, forward, req } = build();
    await controller.submit(req, 'partner-1');
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/submit',
      accessToken: 'token-del-actor',
    });
  });

  it('POST partner-onboarding/:id/branches reenvía la sucursal declarada', async () => {
    const { controller, forward, req } = build();
    const body = { nombre: 'Sucursal Centro' };
    await controller.registerBranch(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/branches',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('PATCH partner-onboarding/:id/branches/:branchId enlaza con la sucursal del ERP', async () => {
    const { controller, forward, req } = build();
    const body = { erpBranchId: 'erp-branch-9' };
    await controller.linkBranch(req, 'partner-1', 'branch-2', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'PATCH',
      path: 'partner-onboarding/partner-1/branches/branch-2',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/qr-codes/upload-url pide la URL de subida del QR', async () => {
    const { controller, forward, req } = build();
    const body = { contentType: 'image/png' };
    await controller.qrUploadUrl(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/qr-codes/upload-url',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/qr-codes registra el QR ya subido', async () => {
    const { controller, forward, req } = build();
    const body = { objectKey: 'qr/partner-1/abc' };
    await controller.registerQr(req, 'partner-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/qr-codes',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST partner-onboarding/:id/branches/:branchId/pos-terminals registra el POS', async () => {
    const { controller, forward, req } = build();
    const body = { serial: 'POS-001' };
    await controller.registerPos(req, 'partner-1', 'branch-2', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'partner-onboarding/partner-1/branches/branch-2/pos-terminals',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('PATCH partner-onboarding/:id/pos-terminals/:terminalId cambia el estado del POS', async () => {
    const { controller, forward, req } = build();
    const body = { status: 'ACTIVE' };
    await controller.changePosStatus(req, 'partner-1', 'term-3', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'PATCH',
      path: 'partner-onboarding/partner-1/pos-terminals/term-3',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('todas las rutas de escritura codifican los identificadores de la ruta', async () => {
    const { controller, forward, req } = build();
    await controller.linkBranch(req, 'partner/raro', 'branch/raro', {});
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'partner-onboarding/partner%2Fraro/branches/branch%2Fraro',
      }),
    );
  });
});
