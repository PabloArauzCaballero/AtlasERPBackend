import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
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
  ListOnboardingCasesQueryDto,
  AssignCaseContractDto,
  CreateCaseMdrRuleDto,
} from '../b2b-sales-crm.dtos';
import {
  branchIdParamsSchema,
  listBranchesQuerySchema,
  listOnboardingCasesQuerySchema,
  assignCaseContractSchema,
  createCaseMdrRuleSchema,
  completeChecklistItemSchema,
  createBranchSchema,
  createMerchantUserSchema,
  createOnboardingCaseSchema,
  onboardingCaseIdParamsSchema,
  setBranchStatusSchema,
  updateBranchSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

/**
 * Cookie del token de identidad upstream. Es la MISMA que emite el gateway de autenticación; aquí
 * sólo se lee, igual que en `partner-onboarding-gateway.controller.ts`.
 */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

@Controller('b2b/onboarding')
export class OnboardingController {
  constructor(private readonly service: B2BSalesCrmService) {}

  /**
   * El token con el que este backend habla con AtlasBackend en nombre de quien llama.
   *
   * Se exige explícitamente en vez de degradar a una llamada sin identificar: encolar un alta de
   * acceso de forma anónima dejaría la petición sin autor, y el autor es medio expediente. El 401
   * es honesto —la sesión del ERP existe, la del proveedor de identidad no—, y se resuelve
   * volviendo a entrar.
   */
  private upstreamToken(req: Request): string {
    const token = (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException(
        'La sesión no lleva token de identidad de Atlas: vuelve a iniciar sesión para poder pedir un acceso de comercio.',
      );
    }
    return token;
  }

  /*
   * Lectura de la cola de onboarding. Faltaba: sin ella la pantalla no podia ofrecer un desplegable
   * y obligaba a teclear el uuid del caso, que nadie conoce de memoria.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases')
  listCases(
    @Query(new ZodValidationPipe(listOnboardingCasesQuerySchema)) query: ListOnboardingCasesQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.service.listOnboardingCases(query);
  }

  /*
   * Las cifras del mini-tablero. Va ANTES de `cases/:onboardingCaseId`: si no, «summary» cae en el
   * parámetro y el validador de uuid lo rechaza con un 400 que habla de otra cosa.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/summary')
  summarizeCases(): Promise<Record<string, unknown>> {
    return this.service.summarizeOnboardingQueue();
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

  /*
   * Registrar al usuario en el CRM Y pedir su acceso a Atlas, en un solo acto.
   *
   * La segunda mitad es la que faltaba: antes esta ruta creaba la membresía y la identidad con la
   * que esa persona inicia sesión se tecleaba aparte, en el portal interno, sin nada que atara una
   * cosa con la otra. Ver `B2BOnboardingService.createMerchantUser`.
   */
  @Roles('OPERATIONS', 'ADMIN')
  @Post('merchant-users')
  createMerchantUser(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createMerchantUserSchema)) body: CreateMerchantUserDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createMerchantUser(body, this.upstreamToken(req));
  }

  /**
   * Preguntar a Atlas en qué quedó el acceso pedido y enlazar la identidad si ya se concedió.
   *
   * Es el cierre del circuito: sin esta llamada `user_id` se queda nulo y el alcance del portal del
   * comercio depende del enlace de respaldo por correo.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Patch('merchant-users/:merchantUserId/identity')
  syncMerchantUserIdentity(
    @Req() req: Request,
    @Param('merchantUserId') merchantUserId: string,
  ): Promise<Record<string, unknown>> {
    return this.service.syncMerchantUserIdentity(merchantUserId, this.upstreamToken(req));
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
    return this.service.listCaseContractOptions(params.onboardingCaseId);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Patch('cases/:onboardingCaseId/contract')
  assignCaseContract(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(assignCaseContractSchema)) body: AssignCaseContractDto,
  ): Promise<Record<string, unknown>> {
    return this.service.assignCaseContract(params.onboardingCaseId, body);
  }

  /* Mismos roles que `POST /b2b/contracts/mdr-rules`: es la misma decisión, dicha desde el caso. */
  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Post('cases/:onboardingCaseId/mdr-rules')
  createCaseMdrRule(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(createCaseMdrRuleSchema)) body: CreateCaseMdrRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createCaseMdrRule(params.onboardingCaseId, body);
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
    return this.service.reconcileCaseIdentity(params.onboardingCaseId, this.upstreamToken(req), user);
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
