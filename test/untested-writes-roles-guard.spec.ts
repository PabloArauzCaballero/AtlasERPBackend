import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/guards/roles.guard';
import type { PinoLoggerService } from '../src/common/logging/pino-logger.service';
import { AuthGatewayController } from '../src/modules/auth-gateway/auth-gateway.controller';
import { FiscalDocumentsController } from '../src/modules/fiscal/siat/controllers/fiscal-documents.controller';
import { MerchantCreditGatewayController } from '../src/modules/partner-onboarding-gateway/merchant-credit-gateway.controller';
import { PartnerOnboardingGatewayController } from '../src/modules/partner-onboarding-gateway/partner-onboarding-gateway.controller';
import { SupportGatewayController } from '../src/modules/partner-onboarding-gateway/support-gateway.controller';

/**
 * Auditoría UNTESTED_WRITE (PR #32 documentó el contrato; esto cubre la protección real): estas
 * 23 rutas de escritura no tenían NINGÚN test que las nombrara por su ruta HTTP. `RolesGuard`
 * deniega por defecto (ver `test/controllers-roles-coverage.spec.ts`), así que lo que hay que
 * fijar por ruta es: (a) el rol declarado es exactamente el esperado — si alguien lo afloja sin
 * querer, cae aquí — y (b) una sesión SIN ese rol recibe 403 mientras una CON el rol pasa.
 */
const ROLE_CASES: Array<{
  route: string;
  controller: new (...args: never[]) => object;
  method: string;
  allowedRoles: string[];
  deniedRole: string;
}> = [
  {
    route: 'PATCH auth/users/:userId',
    controller: AuthGatewayController,
    method: 'updateUser',
    allowedRoles: ['ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'PATCH auth/users/:userId/roles',
    controller: AuthGatewayController,
    method: 'replaceUserRoles',
    allowedRoles: ['ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'PATCH partner-onboarding/:id/branches/:branchId',
    controller: PartnerOnboardingGatewayController,
    method: 'linkBranch',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'PATCH partner-onboarding/:id/commercial-profile',
    controller: PartnerOnboardingGatewayController,
    method: 'updateCommercialProfile',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'PATCH partner-onboarding/:id/pos-terminals/:terminalId',
    controller: PartnerOnboardingGatewayController,
    method: 'changePosStatus',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST accounting/fiscal/documents/:id/annul',
    controller: FiscalDocumentsController,
    method: 'annul',
    allowedRoles: ['admin', 'accountant'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST merchant-credit/:id/applications/:appId/acceptance',
    controller: MerchantCreditGatewayController,
    method: 'decide',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST merchant-credit/:id/payment-claims/:claimId/verification',
    controller: MerchantCreditGatewayController,
    method: 'verifyPaymentClaim',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST merchant/support/cases',
    controller: SupportGatewayController,
    method: 'abrirCaso',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/branches',
    controller: PartnerOnboardingGatewayController,
    method: 'registerBranch',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/branches/:branchId/pos-terminals',
    controller: PartnerOnboardingGatewayController,
    method: 'registerPos',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/commercial-registry',
    controller: PartnerOnboardingGatewayController,
    method: 'setCommercialRegistry',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/documents/upload-url',
    controller: PartnerOnboardingGatewayController,
    method: 'documentUploadUrl',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/legal-representative',
    controller: PartnerOnboardingGatewayController,
    method: 'addLegalRepresentative',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST auth/merchant/reauthenticate',
    controller: AuthGatewayController,
    method: 'merchantReauthenticate',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS'],
    deniedRole: 'ADMIN',
  },
  {
    route: 'POST partner-onboarding/:id/qr-codes',
    controller: PartnerOnboardingGatewayController,
    method: 'registerQr',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/qr-codes/upload-url',
    controller: PartnerOnboardingGatewayController,
    method: 'qrUploadUrl',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/:id/submit',
    controller: PartnerOnboardingGatewayController,
    method: 'submit',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST partner-onboarding/start',
    controller: PartnerOnboardingGatewayController,
    method: 'start',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST support/channels',
    controller: SupportGatewayController,
    method: 'abrirConversacion',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST support/channels/:id/close',
    controller: SupportGatewayController,
    method: 'cerrar',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST support/channels/:id/messages',
    controller: SupportGatewayController,
    method: 'enviar',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST support/channels/:id/read',
    controller: SupportGatewayController,
    method: 'marcarLeido',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
  {
    route: 'POST support/channels/:id/typing',
    controller: SupportGatewayController,
    method: 'escribiendo',
    allowedRoles: ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'],
    deniedRole: 'AUDITOR',
  },
];

describe('Rutas de escritura sin test (UNTESTED_WRITE): guarda de rol por ruta', () => {
  const logger: Pick<PinoLoggerService, 'debugContext' | 'warnContext'> = {
    debugContext: jest.fn(),
    warnContext: jest.fn(),
  };
  const guard = new RolesGuard(new Reflector(), logger as unknown as PinoLoggerService);

  function contextFor(
    controller: new (...args: never[]) => object,
    method: string,
    roles: string[],
  ): ExecutionContext {
    return {
      getHandler: () => (controller.prototype as Record<string, unknown>)[method],
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u1', roles } }) }),
    } as unknown as ExecutionContext;
  }

  it.each(ROLE_CASES)(
    '$route exige exactamente $allowedRoles',
    ({ controller, method, allowedRoles }) => {
      const handler = (controller.prototype as Record<string, unknown>)[method] as object;
      const handlerRoles: string[] =
        (Reflect.getMetadata('roles', handler) as string[] | undefined) ??
        (Reflect.getMetadata('roles', controller) as string[] | undefined) ??
        [];
      expect(handlerRoles.sort()).toEqual([...allowedRoles].sort());
    },
  );

  it.each(ROLE_CASES)(
    '$route: sin el rol requerido responde 403 (sesión con rol "$deniedRole")',
    ({ controller, method, deniedRole }) => {
      expect(() => guard.canActivate(contextFor(controller, method, [deniedRole]))).toThrow(
        ForbiddenException,
      );
    },
  );

  it.each(ROLE_CASES)(
    '$route: con cualquiera de los roles permitidos, la guarda deja pasar',
    ({ controller, method, allowedRoles }) => {
      for (const role of allowedRoles) {
        expect(guard.canActivate(contextFor(controller, method, [role]))).toBe(true);
      }
    },
  );

  it('sin sesión (sin rol alguno), la guarda deniega las 23 rutas', () => {
    for (const { controller, method } of ROLE_CASES) {
      expect(() => guard.canActivate(contextFor(controller, method, []))).toThrow(
        ForbiddenException,
      );
    }
  });
});
