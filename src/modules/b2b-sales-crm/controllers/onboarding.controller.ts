import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  CompleteChecklistItemDto,
  CreateBranchDto,
  CreateMerchantUserDto,
  CreateOnboardingCaseDto,
  OnboardingCaseIdParamsDto,
} from '../b2b-sales-crm.dtos';
import {
  completeChecklistItemSchema,
  createBranchSchema,
  createMerchantUserSchema,
  createOnboardingCaseSchema,
  onboardingCaseIdParamsSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/onboarding')
export class OnboardingController {
  constructor(private readonly service: B2BSalesCrmService) {}

  /*
   * Lectura de la cola de onboarding. Faltaba: sin ella la pantalla no podia ofrecer un desplegable
   * y obligaba a teclear el uuid del caso, que nadie conoce de memoria.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases')
  listCases(): Promise<Record<string, unknown>[]> {
    return this.service.listOnboardingCases();
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/:onboardingCaseId')
  getCase(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.getOnboardingCase(params.onboardingCaseId);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases')
  createCase(
    @Body(new ZodValidationPipe(createOnboardingCaseSchema)) body: CreateOnboardingCaseDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createOnboardingCase(body);
  }

  @Roles('OPERATIONS', 'ADMIN')
  @Post('branches')
  createBranch(
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createBranch(body);
  }

  @Roles('OPERATIONS', 'ADMIN')
  @Post('merchant-users')
  createMerchantUser(
    @Body(new ZodValidationPipe(createMerchantUserSchema)) body: CreateMerchantUserDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createMerchantUser(body);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Patch('cases/:onboardingCaseId/checklist')
  completeChecklistItem(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(completeChecklistItemSchema)) body: CompleteChecklistItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.completeChecklistItem(params.onboardingCaseId, body, user);
  }

  @Roles('OPERATIONS', 'ADMIN')
  @Patch('cases/:onboardingCaseId/activate')
  activateCase(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.activateOnboardingCase(params.onboardingCaseId);
  }
}
