import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  AssignCaseContractDto,
  CreateCaseMdrRuleDto,
  OnboardingCaseIdParamsDto,
} from '../b2b-sales-crm.dtos';
import {
  assignCaseContractSchema,
  createCaseMdrRuleSchema,
  onboardingCaseIdParamsSchema,
} from '../b2b-sales-crm.schemas';
import { OnboardingContractService } from '../services/onboarding/onboarding-contract.service';
import { requireUpstreamToken } from './onboarding-upstream-token';

/** Contrato y comisión del caso: `b2b/onboarding/legal-contract-template` y `cases/:id/contract*`. */
@Controller('b2b/onboarding')
export class OnboardingContractsController {
  constructor(private readonly contracts: OnboardingContractService) {}

  /**
   * El contrato legal por defecto que rige en Atlas (lo publica el portal interno). El ERP sólo lo
   * lee: sin él, el Motor no aprueba a nadie, y la cola tiene que poder decirlo.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Get('legal-contract-template')
  getDefaultLegalContractTemplate(@Req() req: Request): Promise<Record<string, unknown>> {
    return this.contracts.getDefaultLegalContractTemplate(requireUpstreamToken(req));
  }

  /*
   * El contrato y la comisión del alta, sobre el caso. Antes la comisión era una pestaña global
   * que pedía elegir el contrato otra vez en un desplegable, y el contrato del caso no se elegía
   * en ninguna parte: la activación miraba «el activo de la cuenta» y ya.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/:onboardingCaseId/contract-options')
  listCaseContractOptions(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>[]> {
    return this.contracts.listCaseContractOptions(params.onboardingCaseId);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Patch('cases/:onboardingCaseId/contract')
  assignCaseContract(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(assignCaseContractSchema)) body: AssignCaseContractDto,
  ): Promise<Record<string, unknown>> {
    return this.contracts.assignCaseContract(params.onboardingCaseId, body);
  }

  /* Mismos roles que `POST /b2b/contracts/mdr-rules`: es la misma decisión, dicha desde el caso. */
  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Post('cases/:onboardingCaseId/mdr-rules')
  createCaseMdrRule(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(createCaseMdrRuleSchema)) body: CreateCaseMdrRuleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.contracts.createCaseMdrRule(params.onboardingCaseId, body, user);
  }
}
