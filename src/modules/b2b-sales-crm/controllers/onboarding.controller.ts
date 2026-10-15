import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  CreateOnboardingCaseDto,
  ListOnboardingCasesQueryDto,
  OnboardingCaseIdParamsDto,
} from '../b2b-sales-crm.dtos';
import {
  createOnboardingCaseSchema,
  listOnboardingCasesQuerySchema,
  onboardingCaseIdParamsSchema,
} from '../b2b-sales-crm.schemas';
import { MerchantActivationService } from '../services/onboarding/merchant-activation.service';
import { OnboardingCaseOpeningService } from '../services/onboarding/onboarding-case-opening.service';
import { OnboardingCaseQueryService } from '../services/onboarding/onboarding-case-query.service';
import { OnboardingReconciliationService } from '../services/onboarding/onboarding-reconciliation.service';
import { optionalUpstreamToken, requireUpstreamToken } from './onboarding-upstream-token';

/**
 * El caso de onboarding en sí: cola, ficha, apertura y activación. Cada subrecurso del caso
 * (sucursales, usuarios, contrato, KYB, checklist) vive en su propio controlador con el mismo
 * prefijo `b2b/onboarding`; éste se registra PRIMERO en el módulo para que `cases/summary` quede
 * antes de `cases/:onboardingCaseId`.
 */
@Controller('b2b/onboarding')
export class OnboardingController {
  constructor(
    private readonly opening: OnboardingCaseOpeningService,
    private readonly caseQuery: OnboardingCaseQueryService,
    private readonly reconciliation: OnboardingReconciliationService,
    private readonly activation: MerchantActivationService,
  ) {}

  /*
   * Lectura de la cola de onboarding. Faltaba: sin ella la pantalla no podia ofrecer un desplegable
   * y obligaba a teclear el uuid del caso, que nadie conoce de memoria.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases')
  listCases(
    @Query(new ZodValidationPipe(listOnboardingCasesQuerySchema))
    query: ListOnboardingCasesQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.caseQuery.listOnboardingCases(query);
  }

  /*
   * Las cifras del mini-tablero. Va ANTES de `cases/:onboardingCaseId`: si no, «summary» cae en el
   * parámetro y el validador de uuid lo rechaza con un 400 que habla de otra cosa.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/summary')
  summarizeCases(): Promise<Record<string, unknown>> {
    return this.caseQuery.summarizeOnboardingQueue();
  }

  /**
   * Acusar de una vez todo lo que espera a otro sistema: credenciales pendientes en el portal y
   * desenlaces del Motor. Una llamada por carga de la cola, en vez de una por fila.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Post('cases/reconcile-pending')
  reconcilePendingCases(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.reconciliation.reconcilePendingCases(requireUpstreamToken(req), user);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/:onboardingCaseId')
  getCase(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.caseQuery.getOnboardingCase(params.onboardingCaseId);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases')
  createCase(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createOnboardingCaseSchema)) body: CreateOnboardingCaseDto,
  ): Promise<Record<string, unknown>> {
    // Sin exigir el token: el caso se abre igual, y la carpeta del comercio en Atlas —que sí lo
    // necesita— dice en la respuesta por qué no se pudo asegurar.
    return this.opening.createOnboardingCase(body, optionalUpstreamToken(req));
  }

  @Roles('OPERATIONS', 'ADMIN')
  @Patch('cases/:onboardingCaseId/activate')
  activateCase(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.activation.activateOnboardingCase(params.onboardingCaseId);
  }
}
