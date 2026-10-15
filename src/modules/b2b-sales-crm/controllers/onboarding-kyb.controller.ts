import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type { OnboardingCaseIdParamsDto, RequestKybReviewDto } from '../b2b-sales-crm.dtos';
import { onboardingCaseIdParamsSchema, requestKybReviewSchema } from '../b2b-sales-crm.schemas';
import { KybVerificationService } from '../services/onboarding/kyb-verification.service';
import { OnboardingReconciliationService } from '../services/onboarding/onboarding-reconciliation.service';
import { requireUpstreamToken } from './onboarding-upstream-token';

/** Verificación KYB del caso y acuse de credenciales: `b2b/onboarding/cases/:id/...`. */
@Controller('b2b/onboarding')
export class OnboardingKybController {
  constructor(
    private readonly kyb: KybVerificationService,
    private readonly reconciliation: OnboardingReconciliationService,
  ) {}

  /*
   * El tramo del Motor. El ERP PIDE la verificación; decide AtlasBackend con el artefacto
   * PARTNER_KYB_REVIEW, y es el único origen de esa decisión. Antes la activación no preguntaba a
   * nadie: checklist + contrato y adelante.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Post('cases/:onboardingCaseId/partner-link')
  linkPartnerProfile(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.kyb.linkPartnerProfile(params.onboardingCaseId, requireUpstreamToken(req));
  }

  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Post('cases/:onboardingCaseId/kyb-review')
  requestKybReview(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(requestKybReviewSchema)) body: RequestKybReviewDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.kyb.requestKybReview(
      params.onboardingCaseId,
      body,
      requireUpstreamToken(req),
      user,
    );
  }

  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Post('cases/:onboardingCaseId/kyb-review/sync')
  syncKybDecision(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.kyb.syncKybDecision(params.onboardingCaseId, requireUpstreamToken(req));
  }

  /**
   * El acuse de las credenciales: el ERP pregunta a Atlas en qué quedó cada petición del comercio
   * y lo aplica al caso. Es lo que antes había que hacer usuario por usuario, acordándose.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Post('cases/:onboardingCaseId/identity/reconcile')
  reconcileCaseIdentity(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.reconciliation.reconcileCaseIdentity(
      params.onboardingCaseId,
      requireUpstreamToken(req),
      user,
    );
  }
}
