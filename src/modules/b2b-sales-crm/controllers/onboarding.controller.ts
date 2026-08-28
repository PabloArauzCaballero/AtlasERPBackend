import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  SetBranchStatusDto,
  UpdateBranchDto,
  BranchIdParamsDto,
  ListBranchesQueryDto,
} from '../b2b-sales-crm.dtos';
import {
  branchIdParamsSchema,
  listBranchesQuerySchema,
  completeChecklistItemSchema,
  createBranchSchema,
  createMerchantUserSchema,
  createOnboardingCaseSchema,
  onboardingCaseIdParamsSchema,
  setBranchStatusSchema,
  updateBranchSchema,
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

  /*
   * Editar y dar de baja una sucursal. Faltaban: solo se podian crear, nunca corregir ni cerrar.
   *
   * Habia DOS `@Roles` seguidos aqui y el de arriba ganaba, asi que `MERCHANT_ADMIN` —que el de
   * abajo si concedia— quedaba fuera sin que nada lo dijera: el comercio recibia 403 al corregir su
   * propia sucursal y el codigo leia como que si podia.
   */
  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Patch('branches/:branchId')
  updateBranch(
    @Param(new ZodValidationPipe(branchIdParamsSchema)) params: BranchIdParamsDto,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchDto,
  ): Promise<Record<string, unknown>> {
    return this.service.updateBranch(params.branchId, body);
  }

  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Patch('branches/:branchId/status')
  setBranchStatus(
    @Param(new ZodValidationPipe(branchIdParamsSchema)) params: BranchIdParamsDto,
    @Body(new ZodValidationPipe(setBranchStatusSchema)) body: SetBranchStatusDto,
  ): Promise<Record<string, unknown>> {
    return this.service.setBranchStatus(params.branchId, body);
  }

  /** Las sucursales, para poder elegir dónde se origina una venta a plazos. */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE')
  @Get('branches')
  listBranches(
    @Query(new ZodValidationPipe(listBranchesQuerySchema)) query: ListBranchesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.service.listBranches(query);
  }

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
